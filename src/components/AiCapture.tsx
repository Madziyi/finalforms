import { Camera, Check, ImagePlus, RefreshCcw, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { extractForm9 } from "../lib/api";
import type { FieldDefinition, FieldValue } from "../types";

export function AiCapture({
  fields,
  currentValues,
  onVerified,
}: {
  fields: FieldDefinition[];
  currentValues: Record<string, FieldValue>;
  onVerified: (values: Record<string, number | null>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, number | null> | null>(null);
  const [check, setCheck] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<unknown>(null);
  const [verified, setVerified] = useState(false);
  const [reviewClosing, setReviewClosing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reviewCloseTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const aiFields = useMemo(() => fields.filter((field) => field.aiExtract), [fields]);
  const extractedCount = values ? Object.values(values).filter((value) => value !== null).length : 0;

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (reviewCloseTimeoutRef.current !== null) window.clearTimeout(reviewCloseTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!cameraOpen || !streamRef.current || !videoRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().catch(() => setError("Camera preview could not start. Choose a photo instead."));
    const markReady = () => setCameraReady(video.videoWidth > 0 && video.videoHeight > 0);
    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("playing", markReady);
    return () => {
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("playing", markReady);
      video.srcObject = null;
    };
  }, [cameraOpen]);

  async function openCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      fileRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraReady(false);
      setCameraOpen(true);
    } catch {
      fileRef.current?.click();
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
    setCameraOpen(false);
  }

  async function processBlob(blob: Blob) {
    setBusy(true);
    setError(null);
    setVerified(false);
    setDiagnostics(null);
    try {
      const result = await extractForm9(blob);
      setValues(result.values);
      setCheck(result.needsCheck);
      setDiagnostics({ values: result.values, needsCheck: result.needsCheck });
      console.info("Form 9 Gemini result", { values: result.values, needsCheck: result.needsCheck });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the screen.");
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !cameraReady || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("Camera preview is not ready yet. Try again or choose a photo.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    closeCamera();
    if (blob) await processBlob(blob);
  }

  function verify() {
    if (!values || reviewClosing) return;
    onVerified(values);
    setVerified(true);
    setReviewClosing(true);
    reviewCloseTimeoutRef.current = window.setTimeout(() => {
      setValues(null);
      setCheck([]);
      setDiagnostics(null);
      setVerified(false);
      setReviewClosing(false);
      reviewCloseTimeoutRef.current = null;
    }, 300);
  }

  return (
    <section className="ai-panel">
      <div className="section-heading-row">
        <div>
          <div className="eyebrow">AI-assisted entry</div>
          <h2>Capture the DCS screen first</h2>
          <p>Align the screen in the guide, capture it, then verify every extracted value before it is inserted into the form.</p>
        </div>
        <button className="primary-button" onClick={openCamera} disabled={busy}><Camera size={18} /> {values ? "Scan again" : "Take screen photo"}</button>
      </div>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void processBlob(file);
          event.currentTarget.value = "";
        }}
      />
      {busy && <div className="ai-working"><RefreshCcw className="spin" /> Reading the screen…</div>}
      {error && <div className="notice error"><TriangleAlert size={18} /> {error} <button className="text-button" onClick={() => fileRef.current?.click()}><ImagePlus size={16} /> Choose photo</button></div>}
      {values && (
        <div className={reviewClosing ? "ai-review is-closing" : "ai-review"}>
          <div className="ai-review-header">
            <div><strong>Verify extracted readings</strong><span>Correct any value that is wrong. Blank means the AI could not read it.</span></div>
            {verified && <span className="verified-chip"><Check size={15} /> Verified</span>}
          </div>
          {extractedCount === 0 && <div className="notice warning"><TriangleAlert size={18} /> No readable values were found. Retake the photo with the DCS labels and values in focus, or enter readings manually.</div>}
          {diagnostics !== null && <details className="ai-diagnostics"><summary>AI diagnostics</summary><p>Image pixels are not retained or shown here. This log contains Gemini's response and the values accepted by the app.</p><pre>{JSON.stringify(diagnostics, null, 2)}</pre></details>}
          <div className="ai-grid">
            {aiFields.map((field) => (
              <label key={field.key} className={check.includes(field.key) ? "ai-value-card needs-check" : "ai-value-card"}>
                <span>{field.label}</span>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={values[field.key] ?? ""}
                  onChange={(event) => setValues((current) => ({
                    ...(current ?? {}),
                    [field.key]: event.target.value === "" ? null : Number(event.target.value),
                  }))}
                />
                {check.includes(field.key) && <small><TriangleAlert size={13} /> Check</small>}
              </label>
            ))}
          </div>
          <div className="ai-actions">
            <button className="secondary-button" onClick={openCamera} disabled={reviewClosing}><RefreshCcw size={17} /> Retake</button>
            <button className="primary-button" onClick={verify} disabled={reviewClosing}><Check size={18} /> Readings verified</button>
          </div>
        </div>
      )}
      {cameraOpen && (
        <div className="camera-modal">
          <div className="camera-stage">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="camera-frame"><span>Place the bottom edge of the summary just above this line</span></div>
            <button className="camera-close" onClick={closeCamera}><X /></button>
            <button className="capture-button" onClick={capture} disabled={!cameraReady}><Camera size={24} /> {cameraReady ? "Capture" : "Starting camera…"}</button>
          </div>
        </div>
      )}
      {!values && !busy && (
        <div className="ai-empty-note">Manual entry remains available below if the camera or AI is unavailable.</div>
      )}
    </section>
  );
}
