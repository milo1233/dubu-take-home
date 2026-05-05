# 두부 (Dubu) — 아동을 위한 실시간 AI 음성 대화 웹앱(과제)

> Dubu 풀스택 엔지니어 채용 과제 제출물입니다. 5–10세 어린이가 브라우저에서 마이크로 AI 친구 "두부"와 자연스럽게 음성 대화하고, 로그인하여 자신의 대화 기록을 다시 볼 수 있습니다.

5-10세 나이대 설정은 과제 기준 대상은 아니나, 임의의 컨셉으로 진행 하였습니다

---

## 목차

1. [사용 방법](#1-사용-방법)
2. [주요 기술 스택과 선택 이유](#2-주요-기술-스택과-선택-이유)
3. [구현 범위 및 미구현 사항](#3-구현-범위-및-미구현-사항)
4. [설계·구현 중점 포인트](#4-설계구현-중점-포인트)
5. [추후 고려 사항](#5-추후-고려-사항)
6. [부록: 아키텍처 다이어그램과 디렉토리 구조](#6-부록-아키텍처-다이어그램과-디렉토리-구조)

---

## 1. 사용 방법

### 사전 준비

- **Node.js 20 이상** (Node 25에서 검증됨)
- **OpenAI API 키** — Realtime API 사용 가능한 키
- **Supabase 프로젝트** — 무료 플랜으로 충분
- **Google Cloud OAuth 클라이언트** — Google 로그인용

### A) Supabase 셋업 (5분)

1. <https://supabase.com> 에서 새 프로젝트 생성.
2. **SQL Editor** 메뉴에서 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) 내용을 그대로 붙여넣고 실행. → `conversations`, `messages` 테이블이 RLS와 함께 생성됩니다.
3. **Authentication → Providers → Google** 토글을 켜고 Google Cloud Console에서 발급한 OAuth Client ID / Secret을 입력합니다.
   - Google Cloud의 Authorized redirect URI에는 Supabase가 안내하는 `https://<your-project>.supabase.co/auth/v1/callback` 을 등록합니다.
4. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000`
   - Additional Redirect URLs: `http://localhost:3000/auth/callback`
5. **Project Settings → API**에서 `Project URL`과 `anon` 키를 복사합니다.

### B) 환경 변수

[`.env.example`](.env.example)을 복사해 `.env.local`을 만든 뒤 값을 채웁니다.

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=alloy

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> `OPENAI_REALTIME_MODEL` 값은 OpenAI 콘솔에서 사용 가능한 Realtime 모델 ID로 바꿔주세요(예: `gpt-realtime`, `gpt-4o-realtime-preview-2024-12-17` 등). 모델명이 변해도 환경변수만 수정하면 코드는 그대로 동작합니다.

### C) 의존성 설치 + 실행

```bash
npm install
npm run dev
```

`http://localhost:3000` 접속 → Google 로그인 → 마이크 권한 허용 → "대화 시작" 버튼.

#### 동시 접속 테스트

- 같은 머신에서 **시크릿 창**으로 다른 Google 계정으로 로그인하면 두 세션이 독립적으로 동작합니다.
- 또는 같은 네트워크 내 다른 기기에서 `http://<your-local-ip>:3000` 으로 접속.

---

## 2. 주요 기술 스택과 선택 이유

| 영역           | 선택                                                       | 이유                                                                                                                  |
| -------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 프레임워크     | **Next.js 16 (App Router, TypeScript)**                    | 풀스택을 단일 코드베이스로. Server Component로 인증 가드를 깔끔히 구성.                                               |
| 스타일         | **Tailwind CSS v4**                                        | 빠른 UI 반복. 아동 친화 컬러(앰버/로즈)로 손쉽게 분위기 조정.                                                         |
| 인증           | **Supabase Auth (Google OAuth)**                           | 한 번의 토글로 OAuth 활성화. 서버/클라이언트 모두 `@supabase/ssr` 로 세션 동기화.                                     |
| DB             | **Supabase Postgres + RLS**                                | 사용자별 데이터 격리를 DB 레벨에서 강제. 애플리케이션 코드 실수에 대한 안전망.                                        |
| 음성           | **OpenAI Realtime API (WebRTC)**                           | STT+LLM+TTS가 단일 모델로 통합되어 end-to-end 지연이 ~300–500ms. 분리형(STT→LLM→TTS) 파이프라인 대비 압도적으로 낮음. |
| 음성 연결 방식 | **브라우저 ↔ OpenAI 직결 + 서버는 ephemeral token만 발급** | 서버가 오디오를 중계하지 않으므로 다중 동시 접속 시 서버 부하 ≈ 0. 보안상 영구 키는 서버에만 유지.                    |

### 선택지 비교 메모

- **OpenAI Realtime vs LiveKit + 분리형 STT/TTS**: LiveKit은 통화 녹음·SIP·오케스트레이션 등 확장성이 우수하지만, 본 과제처럼 1:1 사용자–AI 대화에서는 Realtime API의 통합 지연이 결정적. 어린이는 응답 지연에 민감하므로 Realtime을 우선했습니다.
- **Web Speech API + Chat Completions**: 셋업은 가장 단순하지만 STT→LLM→TTS 직렬 파이프라인이라 1.5–3초 지연이 발생, "실시간 음성"의 UX를 만들기 불기합니다.
- **Next.js 풀스택 vs 분리형(Vite + Node 백엔드)**: 전체 볼륨과 일회성 과제임을 감안했을때 훨씬 빠르게 구성할 수 있는 Next.js 풀스택 구현을 채택 하였습니다.
- **Supabase vs 자체 Auth + Postgres + Prisma**: RLS 한 줄로 멀티테넌시가 끝나는 점이 매력적. 자체 구현하면 user_id 필터 누락 같은 실수 한 번에 데이터 유출 위험이 생깁니다.

---

## 3. 구현 범위 및 미구현 사항

### 구현 완료 (5대 필수 요구사항)

1. **AI 음성 에이전트 서버** — `POST /api/realtime/session`이 OpenAI Realtime API로 토큰을 발급. 시스템 프롬프트(아동 친화 + 안전 가드)와 한국어 STT(Whisper) 설정 포함.
2. **웹 클라이언트** — 마이크 권한 요청 UX, 연결 상태 뱃지(`idle / requesting-mic / fetching-token / connecting / live / error`), 시작/종료 토글 버튼, 마이크 입력 레벨에 따라 맥동하는 두부 오브.
3. **대화 로그(STT) 실시간 표시** — OpenAI data channel에서 들어오는 transcript 조각을 채팅 버블로 스트리밍. 사용자 발화는 Whisper로 STT 를 통해 텍스트화 하여 표시
4. **사용자 인증 + 대화 기록 조회** — Google OAuth(Supabase) 로그인, 미들웨어로 비인증 사용자는 `/login`으로 자동 리다이렉트. `/history`에서 자신의 과거 대화 목록과 상세 보기.
5. **다중 사용자 동시 접속** — 각 사용자가 OpenAI와 독립적인 RTCPeerConnection을 직접 맺으므로 서버는 stateless. Supabase RLS가 사용자 간 데이터 격리를 DB 레벨에서 보장.

추가로 갖춘 것:

- **인증 검사를 두 겹으로** — 미들웨어가 비로그인 사용자를 `/login`으로 1차 차단하고, 페이지가 그려지기 직전 서버 컴포넌트(`src/app/(app)/layout.tsx`)에서 다시 한 번 `getUser()`로 *"정말 이 사용자가 맞나"*를 확인합니다. 미들웨어가 우회되거나 누락되더라도 페이지 자체가 렌더되지 않도록 안전망을 둔 구조입니다.
- 첫 사용자 발화로 대화 제목 자동 설정 (`messages` POST 시).
- 사용자 발화/AI 응답 turn이 끝나는 시점(`*.completed`/`*.done`)에만 DB INSERT — 잦은 insert 방지 & 완성된 대화 내용만 저장
- 마이크 거부 / 토큰 발급 실패 / 네트워크 단절 등 분기별 한국어 에러 메시지.
- `/auth/signout` POST 라우트로 깔끔한 로그아웃.

### ⏸ 시간상 보류한 항목

- **모바일 사파리 검증** — 데스크탑 크롬 기준으로 동작 확인. iOS Safari WebRTC는 정책 차이가 있어 별도 점검이 필요할 수 있습니다.
- **자동 재연결 로직** — 네트워크 일시 단절 시 PeerConnection을 자동 재생성하는 정책은 미구현. 현재는 사용자가 다시 "대화 시작"을 눌러야 합니다.
- **세션 만료 시 자동 갱신** — OpenAI Realtime 세션 자체에 최대 수명(~15~30분)이 있어 매우 긴 대화에선 끊김이 발생합니다. 만료 직전 새 세션을 발급하고 이전 대화 맥락을 마이그레이션하는 정책은 미구현. 현재는 끊기면 사용자가 다시 시작해야 합니다.
- **대화 중 일시정지/재개**, **텍스트 입력 fallback** — 어린이가 마이크를 못 쓰는 상황을 위한 키보드 입력 경로.
- **음성 톤 선택 UI** — `OPENAI_REALTIME_VOICE` 환경변수로만 변경 가능.
- **유닛/E2E 테스트** — 전체 흐름은 수동 검증으로 대체.

### ⚠️ 부딪힌 문제와 해결 시도

- **Realtime API 이벤트명 변경 가능성**: OpenAI는 `response.audio_transcript.*` 와 `response.output_audio_transcript.*` 두 이름을 시점에 따라 모두 흘려보낸 적이 있어, 훅에서 두 이름 모두 처리하도록 했습니다. 새 이벤트가 추가돼도 한 곳만 수정하면 되도록 `src/lib/realtime/useRealtimeAgent.ts`에 모아 두었습니다.
- **사용자 발화 transcript 누락**: `input_audio_transcription`을 세션 생성 시 `whisper-1`으로 명시하지 않으면 사용자 측 자막이 안 옵니다. 세션 발급 라우트(`src/app/api/realtime/session/route.ts`)에서 이 옵션을 강제했습니다.
- **턴 종료 시점 결정**: turn 단위 저장을 위해 `*.completed`/`*.done` 이벤트만 영속화에 사용하고, delta는 UI 스트리밍에만 사용하도록 분리했습니다. 결과적으로 DB 호출 수 = (턴 수)로 깔끔하게 떨어집니다.

---

## 4. 설계·구현 중점 포인트

### 4.1 "왜 클라이언트 직결 WebRTC인가?"

서버가 오디오를 중계하면 (1) Browser→Server, (2) Server→OpenAI 두 hop이 생겨 지연이 두 배가 되고 서버가 업로드/다운로드 양 끝의 대역폭을 모두 부담합니다. **OpenAI는 ephemeral token을 발급해 브라우저가 직접 OpenAI에 SDP offer를 보내는 패턴을 권장**하므로, 본 앱도 이 방식을 채택했습니다. 결과적으로:

- 서버는 stateless하게 인증/저장만 담당 → **다중 동시 접속이 자연스럽게 스케일**.
- 영구 `OPENAI_API_KEY`는 절대 브라우저에 노출되지 않음 → 보안 안전.

### 4.2 "왜 Supabase RLS를 썼나?"

멀티테넌시 데이터 격리에서 가장 흔한 사고는 "쿼리에 user_id 필터를 빼먹는 것"입니다. RLS를 켜면 정책에 적힌 조건 외에는 DB가 데이터를 돌려주지도, 받지도 않습니다. 본 앱의 정책은 한 줄짜리:

```sql
create policy "own_conversations" on conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

API 라우트에서 user_id 필터를 잠시 잊어도 RLS가 막아주므로, 퀵하게 진행하는 과제 레벨에서 **사고 면적을 좁히는 안전망**이 됩니다.

### 4.3 "Transcript 저장 시점은 turn 경계로"

스트리밍 delta 이벤트를 매번 INSERT하면 turn당 수십 번의 쓰기가 발생합니다. 본 앱은 `*.completed` / `*.done` 이벤트가 도착할 때만 메시지를 저장합니다(`useRealtimeAgent.ts` → `onUserTurnComplete` / `onAssistantTurnComplete` → `VoiceSession.tsx`의 `persistMessage`). UI는 delta로 매끄럽게 흐르고, DB는 깔끔하게 turn 단위로 쌓입니다.

### 4.4 마이크 UX 디테일

- 권한 요청은 **"대화 시작" 버튼 클릭 직후**에만 트리거. 페이지 로드 시 자동 요청은 거부감을 들게 할 수 있고, 유저의 선 행동에 의한 스크립트 실행이라는 안정적인 구조를 추구했습니다.
- 거부되면 정확히 무엇을 해야 할지 한국어로 안내.
- `getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl } })`로 잡음을 보정.
- AnalyserNode로 마이크 RMS를 측정해 두부 오브의 크기를 부드럽게 변화 → "내가 말하면 두부가 듣고 있구나"를 시각적으로 인지.

### 4.5 시스템 프롬프트 — 아동 안전

[`src/lib/prompts/system.ts`](src/lib/prompts/system.ts)에 두부 캐릭터의 말투 규칙(짧은 한국어 존댓말, 1–2 문장, 어려운 단어 회피, 호기심 + 격려)과 안전 규칙(폭력/성인/자해/약물/정치 회피, 개인정보 캐묻지 않기, 의학·법률·금전 조언 금지)을 정의했습니다. 모델 선택보다 시스템 프롬프트가 특정 컨셉 유지 및 대화 품질에 더 큰 영향을 주는 경험이 많아, 이 부분에 시간을 들였습니다.

---

## 5. 추후 고려 사항

더 시간이 주어진다면 다음 순서로 보강하고 싶습니다.

1. **자동 재연결 + 지수 백오프** — 네트워크가 잠깐 끊겨도 자동으로 PC를 재생성. 어린이가 버튼을 다시 누르지 않게.
2. **텍스트 입력 fallback** — 마이크 못 쓰는 환경(헤드폰만 있을 때 등)을 위해 키보드 입력으로도 대화 가능하도록.
3. **부모 보호자 대시보드** — 자녀의 대화 통계 및 기능 제한 등.
4. **요약 기능** — 대화 종료 시 별도 LLM 호출로 1줄 요약 + 키워드 추출.
5. **대화 녹음 저장** — LiveKit 또는 MediaRecorder를 도입해 오디오 원본을 저장(사용자 또는 부모 동의 후).
6. **음성 톤 다양화** — `voice` 파라미터를 사용자별로 선택 + 캐릭터 별 시스템 프롬프트 분리.
7. **모바일 최적화** — iOS Safari WebRTC 안정화, 화면 잠김 방지(NoSleep).
8. **테스트** — Playwright E2E + `useRealtimeAgent` 단위 테스트 + RLS 정책 SQL 테스트.
9. **오류 데이터 수집** — 세션 지연, 토큰 발급 실패율, 마이크 권한 거부율 등 유의미한 운영 관련 오류 데이터 수집.
10. **아이가 말 못 거는 상황 감지** — 30초 무음 시 두부가 "혹시 무슨 일 있어요?" 같은 안전 prompt.

---

## 기타사항

이 프로젝트는 채용 과제 제출 목적으로 작성되었습니다.
