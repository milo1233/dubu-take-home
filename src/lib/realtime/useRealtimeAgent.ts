"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionStatus =
  | "idle"
  | "requesting-mic"
  | "fetching-token"
  | "connecting"
  | "live"
  | "ended"
  | "error";

export type TranscriptRole = "user" | "assistant";

export type TranscriptItem = {
  id: string;
  role: TranscriptRole;
  text: string;
  done: boolean;
};

type Options = {
  onUserTurnComplete?: (text: string) => void;
  onAssistantTurnComplete?: (text: string) => void;
};

type SessionResponse = {
  client_secret: { value: string; expires_at?: number };
  model: string;
};

// Whisper STT가 무음/잡음 구간에서 자주 만들어내는 환각 패턴.
// 영어: YouTube outro 문구, 한국어: 뉴스 마무리 멘트와 유튜브 종료 멘트.
const HALLUCINATION_PATTERNS: RegExp[] = [
  // 영어
  /^thank you[.!]?$/i,
  /^thanks( for watching)?[.!]?$/i,
  /^thank you for watching[.!]?$/i,
  /^bye[.!]?$/i,
  /^you$/i,
  /^yeah[.!]?$/i,
  /^[.…]+$/,
  /^\s*$/,

  // 한국어 — 뉴스 / 방송 마무리 멘트
  /(MBC|KBS|SBS|JTBC|YTN|TV조선|채널A|MBN)\s*뉴스/,
  /(뉴스데스크|뉴스광장|뉴스9|뉴스라인)/,
  /지금까지\s.*(이었습니다|입니다)\.?$/,

  // 한국어 — 유튜브 종료 멘트
  /시청해\s*주셔서/,
  /구독\s*(과|,)?\s*좋아요/,
  /다음\s*시간에/,
  /^감사합니다\.?$/,
  /^수고하셨습니다\.?$/,
];

function isLikelyHallucination(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return HALLUCINATION_PATTERNS.some((re) => re.test(trimmed));
}

// 발화 1턴 동안 로컬 마이크 RMS가 이 값을 한 번도 넘지 않으면
// OpenAI 측 VAD가 잘못 트리거됐다고 판정 (방 안 잡음 ~0.01, 작은 말소리 ~0.05+).
const MIC_ACTIVE_RMS_THRESHOLD = 0.04;

/**
 * OpenAI Realtime API와 브라우저 사이의 WebRTC 연결을 관리하는 훅.
 * - 마이크 캡처 → RTCPeerConnection에 트랙 추가
 * - data channel("oai-events")로 transcript / response 이벤트 수신
 * - 원격 오디오 트랙은 hidden audio element로 자동 재생
 */
export function useRealtimeAgent(options: Options = {}) {
  const { onUserTurnComplete, onAssistantTurnComplete } = options;

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [micLevel, setMicLevel] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRafRef = useRef<number | null>(null);

  const userBufferRef = useRef<Map<string, string>>(new Map());
  const assistantBufferRef = useRef<Map<string, string>>(new Map());
  // 현재 사용자 turn 동안 로컬 마이크 RMS 의 최댓값.
  // OpenAI VAD 가 트리거됐는데 이 값이 임계 이하면 환각으로 간주.
  const userMicMaxRef = useRef(0);

  // 콜백을 ref에 묶어 이벤트 핸들러 안에서 최신값 사용 (재연결 방지).
  const onUserTurnCompleteRef = useRef(onUserTurnComplete);
  const onAssistantTurnCompleteRef = useRef(onAssistantTurnComplete);
  useEffect(() => {
    onUserTurnCompleteRef.current = onUserTurnComplete;
    onAssistantTurnCompleteRef.current = onAssistantTurnComplete;
  }, [onUserTurnComplete, onAssistantTurnComplete]);

  const upsertTranscript = useCallback(
    (
      id: string,
      role: TranscriptRole,
      patch: { text?: string; done?: boolean },
    ) => {
      setTranscript((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === -1) {
          return [
            ...prev,
            {
              id,
              role,
              text: patch.text ?? "",
              done: patch.done ?? false,
            },
          ];
        }
        const next = prev.slice();
        next[idx] = {
          ...next[idx],
          text: patch.text ?? next[idx].text,
          done: patch.done ?? next[idx].done,
        };
        return next;
      });
    },
    [],
  );

  const cleanup = useCallback(() => {
    if (analyserRafRef.current != null) {
      cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
    }
    setMicLevel(0);
  }, []);

  const startMicMeter = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        if (rms > userMicMaxRef.current) userMicMaxRef.current = rms;
        setMicLevel(Math.min(1, rms * 3));
        analyserRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn("mic meter failed", e);
    }
  }, []);

  const handleEvent = useCallback(
    (raw: string) => {
      let evt: { type: string; [k: string]: unknown };
      try {
        evt = JSON.parse(raw);
      } catch {
        return;
      }

      switch (evt.type) {
        // OpenAI 서버 VAD가 사용자 발화 시작을 감지한 시점.
        // 새 턴이 시작됐으니 로컬 마이크 RMS 트래커를 리셋.
        case "input_audio_buffer.speech_started": {
          userMicMaxRef.current = 0;
          break;
        }

        // OpenAI가 conversation에 message item을 추가하는 시점.
        // 이 이벤트의 도착 순서가 곧 대화의 정렬 순서이므로,
        // transcript delta 가 도착하기 전에 placeholder 를 미리 만들어둔다.
        case "conversation.item.created":
        case "conversation.item.added": {
          const item = evt.item as
            | { id?: string; type?: string; role?: string }
            | undefined;
          if (!item?.id || item.type !== "message") break;
          if (item.role !== "user" && item.role !== "assistant") break;
          upsertTranscript(item.id, item.role as TranscriptRole, {});
          break;
        }

        // 사용자 발화 STT 결과 (Whisper)
        case "conversation.item.input_audio_transcription.delta": {
          const id = evt.item_id ? String(evt.item_id) : null;
          if (!id) break;
          const delta = String(evt.delta ?? "");
          const buf = (userBufferRef.current.get(id) ?? "") + delta;
          userBufferRef.current.set(id, buf);
          upsertTranscript(id, "user", { text: buf, done: false });
          break;
        }
        case "conversation.item.input_audio_transcription.completed": {
          const id = evt.item_id ? String(evt.item_id) : null;
          if (!id) break;
          const text = String(
            evt.transcript ?? userBufferRef.current.get(id) ?? "",
          );
          userBufferRef.current.delete(id);

          // 환각 판정: (a) 알려진 환각 패턴 매칭 또는
          //           (b) 턴 동안 로컬 마이크가 임계 이하 = 사용자가 실제로
          //               말하지 않았는데 OpenAI VAD만 잘못 트리거된 경우.
          const localMaxRms = userMicMaxRef.current;
          const looksHallucinated =
            isLikelyHallucination(text) ||
            localMaxRms < MIC_ACTIVE_RMS_THRESHOLD;

          if (looksHallucinated) {
            setTranscript((prev) => prev.filter((t) => t.id !== id));
            if (process.env.NODE_ENV !== "production") {
              console.debug(
                `[realtime] suppressed transcript "${text}" (localMaxRMS=${localMaxRms.toFixed(3)})`,
              );
            }
            break;
          }

          upsertTranscript(id, "user", { text, done: true });
          if (text.trim()) onUserTurnCompleteRef.current?.(text);
          break;
        }

        // 어시스턴트 응답 텍스트 스트리밍 — item_id 로 매칭하여
        // conversation.item.created 가 만들어둔 placeholder 에 채워 넣는다.
        case "response.audio_transcript.delta":
        case "response.output_audio_transcript.delta": {
          const id = evt.item_id ? String(evt.item_id) : null;
          if (!id) break;
          const delta = String(evt.delta ?? "");
          const buf = (assistantBufferRef.current.get(id) ?? "") + delta;
          assistantBufferRef.current.set(id, buf);
          upsertTranscript(id, "assistant", { text: buf, done: false });
          break;
        }
        case "response.audio_transcript.done":
        case "response.output_audio_transcript.done": {
          const id = evt.item_id ? String(evt.item_id) : null;
          if (!id) break;
          const text = String(
            evt.transcript ?? assistantBufferRef.current.get(id) ?? "",
          );
          assistantBufferRef.current.delete(id);
          upsertTranscript(id, "assistant", { text, done: true });
          if (text.trim()) onAssistantTurnCompleteRef.current?.(text);
          break;
        }

        case "error": {
          console.error("realtime error event", evt);
          setError(
            (evt.error as { message?: string } | undefined)?.message ??
              "OpenAI Realtime 에러",
          );
          break;
        }

        default:
          // 디버그: 알려지지 않은 이벤트는 콘솔에만.
          if (process.env.NODE_ENV !== "production") {
            // console.debug("realtime evt", evt.type, evt);
          }
      }
    },
    [upsertTranscript],
  );

  const start = useCallback(async () => {
    if (pcRef.current) return;
    setError(null);
    setTranscript([]);
    userBufferRef.current.clear();
    assistantBufferRef.current.clear();

    try {
      // 1) 마이크 권한
      setStatus("requesting-mic");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = stream;
      startMicMeter(stream);

      // 2) ephemeral token
      setStatus("fetching-token");
      const tokenRes = await fetch("/api/realtime/session", { method: "POST" });
      if (!tokenRes.ok) {
        throw new Error(
          `세션 토큰 발급 실패 (${tokenRes.status}): ${await tokenRes.text()}`,
        );
      }
      const session = (await tokenRes.json()) as SessionResponse;
      const ephemeralKey = session.client_secret?.value;
      if (!ephemeralKey) throw new Error("ephemeral token이 응답에 없음");

      // 3) WebRTC 연결
      setStatus("connecting");
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 원격 오디오 → audio element
      pc.ontrack = (e) => {
        if (audioElRef.current) {
          audioElRef.current.srcObject = e.streams[0];
        }
      };

      // 마이크 트랙 추가
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // data channel
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        setStatus("live");
      };
      dc.onmessage = (e) => handleEvent(e.data as string);
      dc.onerror = (e) => console.error("dc error", e);
      dc.onclose = () => {
        setStatus((s) => (s === "ended" ? s : "ended"));
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          setStatus("error");
          setError("연결이 끊어졌어요. 다시 시도해주세요.");
        }
      };

      // 4) SDP 교환
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(session.model)}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            "Content-Type": "application/sdp",
          },
        },
      );
      if (!sdpRes.ok) {
        throw new Error(
          `OpenAI SDP 응답 실패 (${sdpRes.status}): ${await sdpRes.text()}`,
        );
      }
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      // 마이크 거부의 경우
      if (
        msg.includes("Permission") ||
        msg.includes("denied") ||
        msg.includes("NotAllowed")
      ) {
        setError("마이크 권한이 필요해요. 브라우저 설정에서 허용해주세요.");
      } else {
        setError(msg);
      }
      setStatus("error");
      cleanup();
    }
  }, [cleanup, handleEvent, startMicMeter]);

  const stop = useCallback(() => {
    cleanup();
    setStatus("ended");
  }, [cleanup]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    status,
    error,
    transcript,
    micLevel,
    start,
    stop,
    audioElRef,
  };
}
