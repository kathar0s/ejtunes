# Project: EJTunes - Global Branding & Design Guidelines

이 문서는 'EJTunes' 멀티플랫폼 디지털 프로덕트(iOS, Android, Web App, Web Service 등)를 위한 통합 디자인 가이드라인입니다. 모든 플랫폼에서의 디자인 및 UI 구현은 이 문서에 정의된 핵심 원칙을 기반으로 일관성을 유지해야 합니다.

---

## 1. Core Philosophy (핵심 철학)

EJTunes는 사용자에게 콘텐츠 본연의 가치를 전달하기 위해 절제되고 세련된 디지털 경험을 제공합니다.

* **Style:** 프리미엄 미니멀리즘 (Premium Minimalism). 본질에 집중하고 불필요한 장식을 배제합니다.
* **Keywords:**
    * **Clean & Clear:** 명확한 정보 전달과 깨끗한 인터페이스.
    * **Friendly & Approachable:** 기하학적이지만 부드러운 형태로 친근함 전달.
    * **Modern & Timeless:** 유행을 타지 않는 현대적인 세련미.
* **Visual Execution:**
    * **Strict Flat Design:** 그라데이션, 그림자, 블러, 질감, 3D 효과를 엄격히 배제한 2D 플랫 스타일을 고수합니다.
    * **Soft Geometry:** 모든 요소(아이콘, 버튼, 컨테이너, 카드)는 부드러운 둥근 모서리(Rounded Corners)를 기본으로 합니다. 날카로운 직각은 사용하지 않습니다.
    * **Platform-Native Feel:** 각 플랫폼(iOS, Android, Web)의 고유한 디자인 언어와 사용성을 존중하되, EJTunes만의 브랜딩 아이덴티티를 일관되게 적용합니다.

---

## 2. Color Palette (색상 팔레트)

플랫폼 전반에 걸쳐 사용되는 엄격한 색상 시스템입니다. Semantic(의미론적) 정의를 따릅니다.

### Primary Brand Colors (브랜드 주요 색상)
* **Maldives Mint (Accent/Action):** `#44C6CC`
    * 의미: 활력, 긍정, 주요 행동 유도.
    * 사용처: 메인 버튼(CTA), 활성화된 상태(Active State), 링크, 브랜드 심볼의 강조 요소(플레이리스트 라인).
* **Charcoal (Primary Text/Content - Light Mode):** `#1E1E1E`
    * 의미: 명확성, 가독성, 무게감.
    * 사용처: 주요 제목 및 본문 텍스트, 일반 아이콘, 브랜드 심볼의 메인 요소(음표).
* **Off-White (Background - Light Mode):** `#F7F7F5`
    * 의미: 따뜻함, 깨끗함, 눈의 피로 감소.
    * 사용처: 페이지/화면의 기본 배경색. 순수한 흰색(`#FFFFFF`) 대신 기본으로 사용합니다.

### Secondary & Neutral Colors (보조 및 중립 색상)
* **Pure White (Highlight/On-Dark Text):** `#FFFFFF`
    * 사용처: 브랜드 심볼의 반사광 하이라이트, 다크 모드에서의 텍스트 및 아이콘, 유색 배경 위의 요소.
* **Charcoal Black (Background - Dark Mode):** `#111315`
    * 사용처: 다크 모드 페이지/화면의 기본 배경색.
* **Subtle Gray (Border/Divider - Light Mode):** `#E5E5E5` (예시)
    * 사용처: 미묘한 구분선이나 테두리가 필요할 때 사용 (최소화 권장).

---

## 3. Brand Iconography (브랜드 아이콘 그래픽)

EJTunes의 시각적 정체성을 나타내는 핵심 그래픽입니다. 앱 아이콘, 파비콘, 로고 등으로 사용됩니다.

### 3.1. The Main Brand Mark (메인 브랜드 마크)
* **스타일:** 2D 플랫 벡터, 선명한 엣지, 외곽선 없음.
* **구성:** 중앙 정렬된 두 가지 핵심 요소의 결합.
    1.  **좌측 (Playlist Symbol):**
        * 정확히 **3개**의 수평 둥근 선.
        * 색상: **Maldives Mint (`#44C6CC`)**.
        * 규칙: 상단 두 선은 같은 길이, 최하단 선은 더 짧아야 함. 균등한 수직 간격.
    2.  **우측 (Music Note Symbol):**
        * 대담하고 두꺼운 둥근 8분음표 쌍.
        * 실루엣: 단순하고 기하학적인 형태.
    3.  **핵심 디테일 (Reflection Highlight):**
        * **정확히 단 하나**의 곡선형 '스마일' 반사광.
        * 위치: 오직 **왼쪽 음표 머리 내부**에만 존재.
        * 색상: **Pure White (`#FFFFFF`)**, solid fill.

### 3.2. App/Favicon Variations (테마별 변형)
* **Light Mode (Default):** Off-white 배경 / Mint 라인 / Charcoal 음표 / White 하이라이트.
* **Dark Mode:** Charcoal Black 배경 / Mint 라인 / Off-white 음표 / White 하이라이트.
* *웹 파비콘의 경우 배경 없이 심볼만 투명하게 사용하거나, Light Mode 버전을 기본으로 합니다.*

---

## 4. UI Iconography (인터페이스 아이콘)

서비스 내에서 사용되는 일반 기능 아이콘(검색, 설정, 뒤로가기 등)에 대한 규칙입니다.

* **스타일:** 브랜드 마크와 일관된 미니멀 플랫 스타일.
* **형태:** 채워진 면(Filled) 또는 일정한 두께의 선(Stroke, 약 2px 권장) 기반의 기하학적 형태.
* **색상:** 기본 상태는 Charcoal(Light Mode) / Pure White(Dark Mode), 활성화 시 Maldives Mint 사용.
* **디테일:** 모든 끝부분과 모서리는 둥글게(Rounded Caps & Joins) 처리합니다.

---

## 5. Typography (타이포그래피)

웹과 앱 환경을 모두 고려한 서체 운용 전략입니다.

* **Font Family:** 각 플랫폼의 **시스템 기본 산세리프 서체(System Sans-serif)**를 최우선으로 사용합니다. (iOS: San Francisco, Android: Roboto/Noto Sans, Web: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif).
    * *이유:* 플랫폼 친화적인 경험 제공, 빠른 로딩 속도, 유지보수 용이성.
* **Weight:** 다양한 굵기를 사용하기보다 Regular(400), Medium(500), Bold(700) 정도로 제한하여 명확한 위계를 표현합니다.
* **Scale:** 모듈화된 타입 스케일을 정의하여 일관된 크기 규칙을 적용합니다. (예: H1, H2, Body, Caption).

---

## 6. UI/UX Principles (통합 UI/UX 원칙)

* **Layout & Spacing:**
    * **Generous Whitespace:** 충분한 여백을 사용하여 콘텐츠의 집중도를 높이고 숨 쉴 공간을 제공합니다. 여백은 4px 또는 8px 그리드 시스템을 기반으로 합니다.
    * **Balanced Alignment:** 중앙 정렬을 선호하되, 정보의 성격에 따라 좌측 정렬을 적절히 혼용하여 시각적 균형을 맞춥니다.
* **Components:**
    * 모든 UI 컴포넌트(버튼, 카드, 입력창 등)는 브랜드의 **Rounded Corner** 규칙을 따릅니다.
    * 상태 변화(Hover, Pressed, Disabled)를 명확하게 정의하되, 색상 변화나 투명도 조절만으로 심플하게 표현합니다.
* **Accessibility (접근성):**
    * 텍스트와 배경 간의 충분한 색상 대비(Contrast Ratio)를 확보하여 가독성을 보장합니다. (특히 Mint 색상 사용 시 주의).
    * 플랫폼별 접근성 가이드라인을 준수합니다.