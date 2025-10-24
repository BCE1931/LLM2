import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpinnerCustom } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import {
  speechKey,
  speechRegion,
  openaiEndpoint,
  openaiKey,
  deploymentName,
} from "./Secrets";
const ffmpeg = createFFmpeg({ log: true });

// 🧩 your Azure credentials

async function convertToWav(inputFile) {
  console.log("🎧 Starting file conversion to WAV...");
  if (!ffmpeg.isLoaded()) {
    console.log("⚙️ Loading FFmpeg...");
    await ffmpeg.load();
  }

  const fileName = inputFile.name;
  const outputName = "output.wav";

  console.log(`📥 Writing file ${fileName} into FFmpeg memory...`);
  ffmpeg.FS("writeFile", fileName, await fetchFile(inputFile));

  console.log("🔄 Running FFmpeg conversion command...");
  await ffmpeg.run(
    "-i",
    fileName,
    "-acodec",
    "pcm_s16le",
    "-ac",
    "1",
    "-ar",
    "16000",
    outputName
  );

  console.log("📤 Reading converted WAV file from FFmpeg memory...");
  const data = ffmpeg.FS("readFile", outputName);
  console.log("✅ WAV conversion completed successfully.");

  return new File([data.buffer], outputName, { type: "audio/wav" });
}

const Selection = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [title, setTitle] = useState("");
  const [text, settext] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [prompt, setprompt] = useState("");

  const handleUpload = async () => {
    console.log("🚀 Starting frontend-only transcription + summarization");

    if (!file) {
      console.warn("⚠️ No file selected");
      return alert("Please select an audio or video file!");
    }

    if (prompt.trim() === "") {
      console.warn("⚠️ Missing prompt");
      return alert("Enter a prompt!");
    }

    setLoading(true);
    try {
      console.log("🎧 Converting file to WAV...");
      const wavFile = await convertToWav(file);
      console.log("✅ WAV conversion done:", wavFile);

      // 🎙 Azure Speech-to-Text
      // 🎙 Azure Speech-to-Text
      console.log("🎙 Initializing Azure Speech SDK...");
      const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
        speechKey,
        speechRegion
      );
      speechConfig.speechRecognitionLanguage = "en-US";
      const audioConfig = SpeechSDK.AudioConfig.fromWavFileInput(wavFile);
      const recognizer = new SpeechSDK.SpeechRecognizer(
        speechConfig,
        audioConfig
      );

      console.log("🗣 Starting speech recognition...");

      let transcript = "";

      // await new Promise((resolve, reject) => {
      //   recognizer.recognizing = (s, e) => {
      //     transcript += e.result.text + " ";
      //   };
      //   recognizer.recognized = (s, e) => {
      //     if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      //       transcript += e.result.text + " ";
      //     }
      //   };
      //   recognizer.canceled = (s, e) => {
      //     console.warn("Recognition canceled:", e.reason);
      //     resolve();
      //   };
      //   recognizer.sessionStopped = (s, e) => {
      //     recognizer.stopContinuousRecognitionAsync(() => resolve(), reject);
      //   };

      //   recognizer.startContinuousRecognitionAsync();
      // });

      await new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (speechResult) => {
            if (speechResult && speechResult.text) {
              console.log("✅ Transcription complete:", speechResult.text);
              transcript = speechResult.text; // ✅ assign value
              settext(transcript);
              resolve();
            } else {
              console.warn("⚠️ No speech recognized");
              settext("No speech recognized.");
              resolve();
            }
          },
          (err) => {
            console.error("❌ Speech recognition failed:", err);
            reject(err);
          }
        );
      });

      // 🧠 Azure OpenAI summarization (use transcript here)
      console.log("🧠 Sending text to Azure OpenAI for summarization...");
      const response = await fetch(
        `${openaiEndpoint}openai/deployments/${deploymentName}/chat/completions?api-version=2024-08-01-preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": openaiKey,
          },
          body: JSON.stringify({
            messages: [
              { role: "system", content: "You are a summarizer." },
              { role: "user", content: `${prompt}\n\n${transcript}` }, // ✅ transcript in scope
            ],
          }),
        }
      );

      console.log("📦 Waiting for summarization response...");
      const data = await response.json();
      const summary =
        data?.choices?.[0]?.message?.content ||
        "⚠️ No summary received from Azure OpenAI";
      console.log("✅ Summary generated:", summary);

      setResult(summary);
    } catch (err) {
      console.error("❌ Error occurred:", err);
      alert("Error during transcription or summarization");
    } finally {
      console.log("🏁 Done.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md shadow-md rounded-2xl">
        <CardHeader>
          <CardTitle className="text-center text-xl font-semibold text-gray-700">
            {"Upload Audio / Video"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <Input
            type="text"
            value={prompt}
            onChange={(e) => {
              setprompt(e.target.value);
            }}
            placeholder="Enter Prompt"
            disabled={loading}
          />

          {audioUrl && (
            <div className="mt-3">
              <audio controls src={audioUrl} className="w-full rounded-md">
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          <Input
            type="file"
            accept="audio/*,video/*"
            onChange={(e) => {
              const f = e.target.files[0];
              console.log("📂 Selected file:", f);
              setFile(f);
              if (f) setAudioUrl(URL.createObjectURL(f));
            }}
            disabled={loading}
          />

          <Button
            className="w-full flex items-center justify-center gap-2"
            onClick={handleUpload}
            disabled={loading}
          >
            {loading && <SpinnerCustom />}
            {loading ? "Analyzing..." : "Submit"}
          </Button>

          {result && (
            <div className="bg-gray-100 p-3 rounded-lg border text-gray-700 w-96">
              <Accordion type="single" collapsible>
                <AccordionItem value="summary">
                  <AccordionTrigger className="font-semibold text-gray-800">
                    📝 Summary
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm whitespace-pre-wrap text-gray-700">
                      {result}
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="transcription">
                  <AccordionTrigger className="font-semibold text-gray-800">
                    🎙️ Transcription
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm whitespace-pre-wrap text-gray-700">
                      {text}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Selection;
