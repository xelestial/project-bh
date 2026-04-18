# Project. BH 제안 문서
## React 멀티플레이 선행 개발 + Unity 최종 이행 전략

버전: v1.0  
대상: 프로젝트 제안 / 아키텍처 합의 / 초기 개발 착수 기준  
작성 목적: Project. BH를 유지보수 가능한 멀티플레이 게임으로 개발하기 위한 초기 방향, 구조 원칙, 단계별 계획, 다음 단계 명확화

---

## 1. 제안 배경

Project. BH는 사각 그리드 기반의 턴제 보드게임으로, 보물상자 회수와 점수 경쟁, 속성 타일 상호작용, 타일 회전 메커니즘을 핵심으로 한다.

이 프로젝트는 최종적으로 Unity 기반 게임으로 완성하는 것을 목표로 한다. 다만 초기 단계에서는 다음 목적을 위해 **React 기반 멀티플레이 게임**으로 먼저 개발한다.

1. 게임 규칙을 빠르게 검증한다.
2. 멀티플레이 흐름과 서버 권한 모델을 조기에 확정한다.
3. 시각 효과보다 규칙 엔진과 상태 전이 모델을 먼저 안정화한다.
4. 최종 Unity 이행 시 재사용 가능한 규칙, 프로토콜, 테스트 자산을 확보한다.

즉, 웹 버전은 일회성 프로토타입이 아니라, **정식 규칙 참조 구현(reference implementation)** 이자 **멀티플레이 시스템 검증판**으로 취급한다.

---

## 2. 프로젝트 목표

### 2-1. 제품 목표
- 플레이 가능한 온라인 멀티플레이 버전을 우선 완성한다.
- 룰 충돌, 템포, 전략성, 상호작용 밀도를 실제 플레이 기준으로 검증한다.
- 이후 Unity 클라이언트로 이행할 때 핵심 규칙을 다시 설계하지 않도록 한다.

### 2-2. 기술 목표
- 엔진 / 프론트 / 백엔드가 느슨하게 결합된 구조를 만든다.
- 일부 계층만 교체해도 전체 시스템을 버리지 않도록 설계한다.
- 명시적 DI와 포트/어댑터 구조를 사용해 유지보수성을 높인다.
- authoritative multiplayer 구조를 채택해 규칙 판정의 기준점을 서버로 일원화한다.
- 테스트와 리플레이가 가능한 결정론적 규칙 엔진을 구축한다.

### 2-3. 조직/개발 목표
- Codex와 Claude가 동일한 구조 원칙을 따르도록 문서화한다.
- 문서 기반 개발을 우선하여, 룰 변경과 구현 변경이 분리되지 않게 한다.
- 장기적으로 10만 줄 이상이 되어도 구조 붕괴가 일어나지 않는 기반을 마련한다.

---

## 3. 핵심 제안

이 프로젝트는 아래 구조를 기준으로 시작한다.

```text
[game engine]
  순수 규칙 엔진 / 상태 전이 / 판정 / 시뮬레이션 / 리플레이

[game server]
  authoritative match state / 명령 검증 / 턴 진행 / 동기화

[frontend]
  React UI / 입력 / HUD / 애니메이션 / 디버그 도구 / 관전 UI

[platform backend]
  로그인 / 프로필 / 매치 히스토리 / 리더보드 / 운영 API
```

이 구조의 핵심 원칙은 다음과 같다.

- **엔진은 프론트엔드와 분리한다.**
- **서버는 authoritative 하다.**
- **React는 렌더링 셸이며, 규칙의 소유자가 아니다.**
- **플랫폼 백엔드는 실시간 게임 서버와 분리한다.**
- **최종 Unity 이행 시 바뀌는 것은 주로 프론트이며, 엔진과 프로토콜은 최대한 유지한다.**

---

## 4. 아키텍처 원칙

## 4-1. Engine First
가장 먼저 구현할 것은 UI가 아니라 **headless game engine**이다.

엔진은 다음 역할만 담당한다.
- 상태 모델 정의
- 명령 처리
- 합법/불법 판정
- 상태 전이
- 이벤트 생성
- 라운드 종료 판정
- 승패 계산
- 리플레이 가능 로그 생성

엔진은 아래를 몰라야 한다.
- React
- DOM
- 네트워크 세부 구현
- 데이터베이스
- 인증 시스템
- 특정 렌더러

## 4-2. Server Authoritative
클라이언트는 상태를 확정하지 않고, **의도(intent)** 만 보낸다.

예:
- 이동 요청
- 타일 던지기 요청
- 회전 요청
- 특수카드 사용 요청
- 우선권 제출 요청

서버는 요청을 검증한 뒤:
- 허용되면 상태를 변경하고 브로드캐스트한다.
- 거부되면 사유를 반환한다.

즉, 실제 보드 상태와 라운드 상태의 기준점은 항상 서버다.

## 4-3. React는 표현 계층이다
React 클라이언트는 다음 역할을 가진다.
- 보드 렌더링
- 입력 UI
- 상태 표시
- 연출 재생
- 디버그 패널
- 리플레이 뷰어

React 클라이언트는 다음 역할을 가지지 않는다.
- authoritative 판정
- 실제 피해 계산
- 실제 점수 계산
- 실제 턴 종료 판정
- 실제 보물 소유 결정

## 4-4. Explicit DI
의존성은 전역 싱글턴이나 묵시적 import 체인이 아니라, **composition root** 에서 명시적으로 주입한다.

예상 포트:
- `RngPort`
- `ClockPort`
- `TelemetryPort`
- `MatchRepositoryPort`
- `IdentityPort`
- `TransportPort`
- `PersistencePort`

도메인과 엔진은 포트에만 의존하고, 구현체는 서버/웹/테스트 환경에서 각각 바꿔 끼운다.

## 4-5. Deterministic Rules
같은 입력 로그를 넣으면 같은 결과가 나와야 한다.

이를 위해:
- 엔진 내부에서 `Math.random()` 직접 사용 금지
- 엔진 내부에서 `Date.now()` 직접 사용 금지
- 외부 IO 직접 접근 금지
- 모든 외부 값은 포트로 주입

이 원칙은 아래 기능을 위해 필수다.
- 리플레이
- 버그 재현
- 회귀 테스트
- self-play 시뮬레이션
- Unity 포팅 검증

## 4-6. Front / Engine / Backend 교체 가능성 확보
이 프로젝트는 다음 교체 가능성을 전제로 한다.

- React 프론트를 Unity 클라이언트로 교체 가능해야 한다.
- 게임 서버의 일부 인프라 구현을 교체 가능해야 한다.
- 플랫폼 백엔드를 별도 서비스로 분리 가능해야 한다.
- 엔진 버전 업 시 프론트와 서버가 계약 기반으로 따라올 수 있어야 한다.

즉, **계층 간 연결은 코드 공유가 아니라 계약(contract) 중심**이어야 한다.

---

## 5. 추천 기술 방향

## 5-1. 저장소 구조
- 모노레포 사용
- `pnpm workspace` 기반 패키지 분리
- 공통 타입/엔진/프로토콜/SDK를 패키지로 관리

## 5-2. 프론트엔드
- React
- TypeScript strict mode
- 프레젠테이션과 상태 구독 분리
- 도메인 규칙은 React 내부에 직접 작성하지 않음

## 5-3. 실시간 게임 서버
- TypeScript 기반 authoritative game server
- 방 생성, 참가, 재접속, 명령 검증, 상태 동기화 담당
- 룸 단위 match lifecycle 관리

## 5-4. 플랫폼 백엔드
- 로그인
- 프로필
- 매치 기록
- 리더보드
- 운영 API
- 비실시간 데이터 처리

## 5-5. 테스트 도구
- 단위 테스트
- 계약 테스트
- 시뮬레이션 테스트
- E2E 테스트
- replay/golden fixture 기반 검증

## 5-6. 최종 Unity 이행
- Unity는 최종 프론트엔드/클라이언트로 취급
- TS 엔진을 바로 런타임 공유하기보다, 참조 구현과 테스트 기준점으로 사용
- 이후 C# 포팅 시 동일한 fixture와 리플레이 로그로 검증

---

## 6. 제안하는 모노레포 구조

```text
repo/
  apps/
    web-client/
    game-server/
    platform-api/
    ops-admin/

  packages/
    game-domain/
    game-engine/
    game-protocol/
    game-client-sdk/
    game-testkit/
    ui-design-system/
    shared-utils/
    config-typescript/
    config-eslint/

  docs/
    architecture/
    adr/
    rules/
    networking/
    testing/

  tools/
    scripts/
    codegen/
```

### 패키지 역할

#### `packages/game-domain`
- 상태 타입
- 엔티티
- 값 객체
- enum
- command/event 정의의 기초 타입

#### `packages/game-engine`
- 순수 규칙 엔진
- 상태 전이
- 라운드/턴 판정
- 승패 계산
- 리플레이 지원
- 시뮬레이터

#### `packages/game-protocol`
- 클라이언트/서버 메시지 타입
- 에러 코드
- 버전 규칙
- 스냅샷/이벤트 schema

#### `packages/game-client-sdk`
- 서버 연결
- 이벤트 구독
- 재접속 처리
- 프론트용 client abstraction

#### `packages/game-testkit`
- fixture
- golden test helpers
- replay loader
- 시뮬레이션 helper

#### `apps/game-server`
- authoritative room 서버
- 명령 검증
- 상태 브로드캐스트
- match lifecycle

#### `apps/platform-api`
- 로그인
- 유저 데이터
- 매치 기록
- 운영 endpoint

#### `apps/web-client`
- 로비
- 방 UI
- 보드 렌더링
- HUD
- 디버그 도구
- 리플레이 UI

---

## 7. 규칙 엔진 설계 방향

엔진은 최소한 아래 개념을 가져야 한다.

### 상태 모델
- `GameState`
- `MatchState`
- `RoundState`
- `TurnState`
- `PlayerState`
- `BoardState`
- `TileState`
- `TreasureState`
- `CardState`

### 입력 모델
- `Command`
  - `SubmitPriorityCommand`
  - `MoveCommand`
  - `ThrowTileCommand`
  - `RotateTilesCommand`
  - `UseSpecialCardCommand`
  - `OpenTreasureCommand`
  - `EndTurnCommand`

### 출력 모델
- `DomainEvent`
  - 이동 완료
  - 타일 상태 변화
  - 체력 감소
  - 탈락
  - 보물상자 획득
  - 보물상자 드롭
  - 보물상자 개봉
  - 라운드 종료
  - 점수 반영

### 설계 원칙
- 모든 규칙은 명령 처리 함수 또는 resolver 안에 존재한다.
- UI 친화적인 파생 상태는 엔진이 아니라 selector 계층에서 계산한다.
- 판정과 연출은 분리한다.
- 한 명령 처리 결과는 `newState + events + rejections` 형태가 바람직하다.

---

## 8. 멀티플레이 설계 방향

## 8-1. 기본 모델
- 방 단위 매치 진행
- 서버 authoritative
- 클라이언트는 intent 전송
- 서버가 합법성 판정 후 상태 반영

## 8-2. 필요한 핵심 기능
- 방 생성 / 참가 / 퇴장
- ready 상태
- 매치 시작
- 우선권 제출
- 명령 처리
- reconnect
- spectator
- match end 및 기록 저장

## 8-3. 동기화 원칙
- 상태 스냅샷과 이벤트 스트림을 분리할 수 있어야 한다.
- UI는 가능한 한 이벤트 기반으로 연출하고, 진실 값은 스냅샷 기준으로 복원한다.
- 재접속 시에는 반드시 authoritative snapshot 기준으로 복구한다.

## 8-4. 안티패턴
- 클라이언트 예측 결과를 authoritative 상태처럼 취급
- 프론트와 서버에 규칙을 이중 구현
- 에니메이션 완료를 규칙 완료 조건으로 사용

---

## 9. 테스트 및 품질 전략

## 9-1. 엔진 테스트
반드시 작성해야 할 테스트:
- 보물상자 배치 및 확인
- 특수카드 경매 순서
- 우선권 동률 규칙
- 이동 1+2 규칙
- 보물상자 획득 즉시 턴 종료
- 보물상자 소지 중 행동 제한
- 타일 던지기 가능/불가 규칙
- 불/물/전기/얼음/강/거대화염 상호작용
- 체력 0 탈락 처리
- 탈락 시 보물상자 드롭 처리
- 라운드 종료 조건
- 최종 승리 판정

## 9-2. 프로토콜 테스트
- 잘못된 command schema 거부
- 버전 불일치 처리
- snapshot 직렬화/역직렬화 검증
- reconnect 시 복구 가능성 검증

## 9-3. 서버 통합 테스트
- 복수 클라이언트 동시 접속
- 잘못된 요청 거부
- 턴 순서 강제
- reconnect 후 상태 일관성
- match 종료 후 기록 저장

## 9-4. UI 테스트
- 로비 진입
- 방 입장
- 핸드/우선권/특수카드 UI
- 타일 선택과 타겟 지정
- 이벤트 로그 표시
- 관전 모드

## 9-5. 리플레이 및 회귀 검증
- command log로 동일 match 재현 가능해야 한다.
- 알려진 버그는 replay fixture로 남긴다.
- Unity 포팅 이후 동일 fixture를 다시 통과해야 한다.

---

## 10. 문서화 및 운영 원칙

## 10-1. 문서 우선 원칙
다음 항목은 구현보다 먼저 또는 동시에 관리한다.
- 룰 문서
- ADR
- protocol 문서
- 패키지 역할 문서
- 테스트 기준 문서

## 10-2. 변경 관리
다음이 바뀌면 문서도 함께 갱신한다.
- 룰
- command/event 계약
- 상태 모델
- 네트워크 소유권
- 에러 코드

## 10-3. 운영 관측성
최소한 아래 값은 추적 가능해야 한다.
- match id
- room id
- player id
- command id
- round number
- turn number
- rejection reason
- reconnect reason
- replay id

---

## 11. 단계별 실행 계획

## Phase 0. 구조 고정
목표: 개발 전에 구조 원칙과 계약을 고정한다.

산출물:
- AGENTS.md
- 제안 문서
- 룰북 정리본
- ADR 초안
- 상태 모델 초안
- command/event 목록
- 패키지 경계 정의

완료 기준:
- UI 없이 텍스트 시뮬레이터 기준으로 한 라운드의 구조를 설명할 수 있다.
- 엔진/프론트/서버/백엔드 책임이 문서로 분리되어 있다.

## Phase 1. Headless 엔진 구축
목표: UI 없이 규칙이 돌아가는 상태를 만든다.

산출물:
- `game-domain`
- `game-engine`
- deterministic RNG 포트
- 라운드/턴 resolver
- 기본 테스트 셋
- 간단한 CLI 시뮬레이터

완료 기준:
- 자동 시뮬레이션 가능
- 핵심 규칙이 테스트로 검증됨
- 버그 재현이 UI 없이 가능

## Phase 2. Authoritative 게임 서버 구축
목표: 서버가 상태를 소유하는 멀티플레이 기반을 만든다.

산출물:
- room 서버
- join/leave/reconnect 흐름
- command validation
- authoritative state broadcast
- match event log

완료 기준:
- 여러 클라이언트가 같은 match를 공유할 수 있다.
- 서버가 불법 명령을 거부한다.
- 재접속 시 상태 복구가 가능하다.

## Phase 3. React 멀티플레이 클라이언트 구축
목표: 사람이 실제로 플레이 가능한 웹 버전을 만든다.

산출물:
- 로비
- 방 화면
- 보드 렌더러
- HUD
- 카드/우선권 UI
- 디버그 패널
- replay viewer 기본형

완료 기준:
- 1판 플레이 가능
- 핵심 규칙이 UI에서 재현됨
- 디버그 로그로 match 해석 가능

## Phase 4. Platform 백엔드 구축
목표: 메타 기능과 운영 기능을 분리한다.

산출물:
- auth
- profile
- match history
- leaderboard
- admin API

완료 기준:
- match 결과를 저장/조회 가능
- 유저 메타와 게임 서버를 분리 운영 가능

## Phase 5. 프로덕션 강화
목표: 안정성과 운영성을 확보한다.

산출물:
- telemetry
- rate limiting
- replay export
- 운영 로그 검색성 개선
- E2E 테스트 강화
- CI 품질 게이트

완료 기준:
- 회귀 테스트 없이는 릴리스하지 않는다.
- 장애 발생 시 replay/log로 원인 추적 가능하다.

## Phase 6. Unity 이행 준비
목표: 최종 클라이언트 이행을 위한 기준 자산을 확정한다.

산출물:
- protocol freeze 초안
- fixture pack
- replay spec
- Unity adapter prototype
- C# 포팅 계획서

완료 기준:
- Unity에서 read-only viewer 또는 spectator viewer 수준의 최초 통합 가능
- 이후 interactive client로 확장 가능한 상태 확보

---

## 12. 다음 단계 제안

아래는 **문서 작성 이후 바로 실행할 다음 단계**다.

## Step A. 아키텍처 결정 고정
우선 아래 항목을 ADR로 확정한다.
- authoritative 서버 모델 채택
- 모노레포 구조 채택
- 엔진 우선 전략 채택
- React의 역할 제한
- Unity 이행 전제

**산출물**
- ADR 01 ~ ADR 05

## Step B. 룰을 엔진 명세로 재작성
현재 룰북을 사람이 읽는 설명에서 한 단계 더 나아가, 엔진이 구현 가능한 명세로 바꾼다.

필요한 항목:
- 상태 필드 정의
- 타일 상호작용 우선순위
- 턴 단계 세분화
- 예외 상황 정의
- 모호한 규칙 해소

**산출물**
- `docs/rules/engine-spec.md`
- `docs/rules/examples.md`

## Step C. 상태/명령/이벤트 스키마 초안 작성
다음 3종을 먼저 고정한다.
- State schema
- Command schema
- Domain event schema

**산출물**
- `packages/game-domain/src/*`
- `docs/architecture/state-model.md`
- `docs/networking/protocol-overview.md`

## Step D. Headless 엔진 스켈레톤 작성
최소 동작하는 구조를 먼저 만든다.

구성 예시:
- `createInitialMatchState()`
- `applyCommand()`
- `resolveRoundEnd()`
- `resolveMatchEnd()`
- `runReplay()`

**산출물**
- `packages/game-engine` 초기 코드
- 최소 테스트 20~30개

## Step E. 텍스트 기반 match 시뮬레이터 작성
UI 없이 match 흐름을 확인할 수 있어야 한다.

예:
- 플레이어 2~4명
- 우선권 제출
- 이동
- 타일 던지기
- 라운드 종료
- 점수 정산

**산출물**
- `tools/simulate-match.ts`
- 샘플 replay 로그

## Step F. 서버 룸 모델 초안 작성
엔진이 돌기 시작하면 즉시 서버 룸 모델을 얹는다.

필요 항목:
- room lifecycle
- player session
- reconnect strategy
- spectator admission
- turn timeout 정책

**산출물**
- `apps/game-server` 초기 room 구현
- command admission policy 문서

---

## 13. 제안 승인 후 첫 2주 실행안

### 1주차
- 제안 문서 확정
- AGENTS.md / CLAUDE.md 확정
- ADR 작성
- 룰북을 엔진 명세로 재정렬
- 모노레포 생성

### 2주차
- `game-domain` 패키지 생성
- `game-engine` 패키지 생성
- 상태 모델 초안 구현
- 보물/체력/턴/타일 테스트 작성
- CLI 시뮬레이터로 1라운드 재현

**2주차 종료 시 성공 기준**
- UI 없이 한 라운드가 코드와 테스트로 재현된다.
- 규칙 모호점이 문서화된다.
- React 개발을 시작할 수 있을 만큼 명세가 정리된다.

---

## 14. 리스크와 대응

## 리스크 1. 룰이 구현 도중 계속 흔들림
대응:
- 룰 변경은 문서와 ADR을 먼저 바꾼 뒤 코드 반영
- 예시 기반 테스트를 함께 추가

## 리스크 2. React 쪽에 규칙이 새어 들어감
대응:
- 프론트에서 규칙 계산 금지
- selector/view model 수준까지만 허용
- authoritative 결과만 신뢰

## 리스크 3. 서버/클라이언트 규칙 이중화
대응:
- 규칙은 엔진 하나에서만 구현
- 서버는 엔진 호출자
- 프론트는 엔진 소비자가 아님

## 리스크 4. Unity 이행 시 전면 재작성 필요
대응:
- 지금부터 protocol / fixture / replay를 자산으로 관리
- TS 엔진을 참조 구현으로 삼고 C# 포팅은 검증 기반으로 진행

## 리스크 5. 운영 난이도 증가
대응:
- 초기에 telemetry/logging 키를 정의
- replay를 운영 도구로 적극 활용

---

## 15. 최종 결론

Project. BH는 단순한 웹 프로토타입이 아니라, **최종 Unity 게임으로 이어지는 멀티플레이 규칙 플랫폼**으로 개발해야 한다.

이를 위해 초기 단계에서 가장 중요한 선택은 다음 세 가지다.

1. **엔진 / 프론트 / 백엔드 경계를 초기에 강하게 나눈다.**
2. **서버 authoritative 구조를 채택한다.**
3. **React 버전을 규칙 참조 구현이자 검증 도구로 사용한다.**

이 제안은 다음 결과를 목표로 한다.
- 웹에서 빠르게 검증 가능
- 멀티플레이 구조 조기 고정
- 유지보수성 확보
- Unity 이행 비용 최소화
- AI 에이전트(Codex / Claude)가 일관된 방식으로 개발 가능

즉, 지금 이 프로젝트는 “무엇을 빨리 만들까”보다 **“무엇을 오래 유지할 수 있는 구조로 시작할까”** 가 우선이다.

---

## 부록 A. 즉시 작성이 필요한 문서 목록
- `AGENTS.md`
- `CLAUDE.md`
- `docs/adr/ADR-001-authoritative-server.md`
- `docs/adr/ADR-002-engine-first.md`
- `docs/adr/ADR-003-monorepo-boundaries.md`
- `docs/adr/ADR-004-react-shell-only.md`
- `docs/adr/ADR-005-unity-transition-strategy.md`
- `docs/rules/engine-spec.md`
- `docs/rules/examples.md`
- `docs/architecture/state-model.md`
- `docs/networking/protocol-overview.md`
- `docs/testing/golden-fixture-strategy.md`

## 부록 B. 즉시 생성할 저장소 초기 디렉터리
```text
repo/
  apps/
    web-client/
    game-server/
    platform-api/
  packages/
    game-domain/
    game-engine/
    game-protocol/
    game-testkit/
  docs/
    adr/
    rules/
    architecture/
    networking/
    testing/
```
