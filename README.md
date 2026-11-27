# ALLAI Web Terminal

Alpine Linux의 실제 Bash를 브라우저에서 사용하는 개인용 웹 터미널입니다.
별도의 Docker, Node.js, 가상 리눅스 환경을 만들지 않고, 설치된 시스템의 파일과 프로그램을 그대로 사용합니다. 브라우저 UI 및 PTY/WebSocket 연결은 ttyd가 제공합니다.

## 설치

Alpine Linux에서 저장소를 복제합니다. 비공개 저장소이므로 GitHub 인증이 필요합니다.

```sh
# root 권한으로 실행
apk add --no-cache git
git clone https://github.com/doksins/allaitest.git
cd allaitest
sh install.sh
```

## 실행

가능하면 root가 아닌 실제 사용할 사용자 계정으로 실행하세요.

```sh
sh start.sh
```

기본 주소: http://127.0.0.1:7681/
종료: 서버를 실행한 터미널에서 Ctrl+C.

원격 컴퓨터에서 접근하려면 SSH 포트 포워딩을 사용하거나 인증된 HTTPS 프록시를 연결합니다.

```sh
# 사용자 PC에서 실행 (SSH 서버가 있는 경우)
ssh -N -L 7681:127.0.0.1:7681 USER@HOST
```

그런 다음 사용자 PC의 브라우저에서 http://127.0.0.1:7681/ 을 엽니다.

## 샌드박스의 웹 포트 미리보기 기능 이용

샌드박스가 인증된 HTTPS 웹 프록시 및 WebSocket 연결을 지원할 때만 사용합니다.
프록시가 내부 루프백 포트에 접근할 수 있으면 기본 실행 설정을 유지합니다.
다른 인터페이스에 바인딩해야 한다면 방화벽/네트워크 제한으로 프록시에서만 접근하도록 하고, 별도의 강력한 암호도 설정합니다.

```sh
# bash에서 실행: 암호가 셸 기록에 들어가지 않도록 입력
read -r -s -p 'Terminal password: ' TERMINAL_PASSWORD
echo
TERMINAL_BIND=0.0.0.0 TERMINAL_CREDENTIAL="admin:$TERMINAL_PASSWORD" sh start.sh
unset TERMINAL_PASSWORD
```

위 명령은 포그라운드에서 실행됩니다. 종료하면 unset이 실행됩니다.
프록시의 공개 HTTPS 주소에서 접속합니다. 임의의 공개 HTTP 주소로 포트를 노출하지 마세요.
ttyd의 Basic Auth 암호는 실행 중 프로세스 인자에 표시될 수 있으므로 공유 시스템에서 주의하세요.

## 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| PORT | 7681 | 서버 포트 |
| TERMINAL_BIND | 127.0.0.1 | 수신 인터페이스 |
| TERMINAL_CREDENTIAL | 미설정 | Basic Auth (user:password), 원격 바인딩 시 필수 |
| TERMINAL_BASE_PATH | 미설정 | 경로 기반 리버스 프록시용 경로 (예: /terminal) |
| TERMINAL_TLS_CERT | 미설정 | 직접 HTTPS용 인증서 파일 |
| TERMINAL_TLS_KEY | 미설정 | 직접 HTTPS용 개인 키 파일 |

## 보안 및 동작

- 쓰기 가능한 실제 Bash 셸입니다. 접속자는 실행 계정의 모든 권한을 가집니다.
- 기본 루프백 바인딩, WebSocket Origin 검사, 동시 클라이언트 1개 제한을 사용합니다.
- 외부 직접 접속에는 TLS를 적용하고 방화벽으로 접근을 제한하세요. 리버스 프록시 사용 시 TLS, 인증, WebSocket Upgrade 및 원본 Host 처리가 필요합니다.
- Origin 검사를 통과하지 못한다면 프록시의 Host/Origin 전달 설정을 확인하세요.
- GitHub Pages는 정적 호스팅이므로 이 터미널을 실행할 수 없습니다.
- 터미널 연결 종료 시 실행 중인 셸이 종료될 수 있습니다. 작업 지속이 필요하면 tmux 등을 별도로 사용하세요.
- 샌드박스의 네트워크/패키지 설치/포트 공개 정책을 우회하지 않습니다.

## 확인

```sh
sh -n install.sh
sh -n start.sh
# 브라우저 터미널에서 실행:
cat /etc/alpine-release
uname -r
echo "$BASH_VERSION"
pwd
```

참고: https://github.com/tsl0922/ttyd

## 웹 미리보기 서버 (Node.js 버전)

샌드박스 웹 미리보기에서는 기존 ttyd 실행 방식과 별도로 아래 서버를 사용할 수 있습니다.
WebSocket이 실패해도 인증된 HTTP 요청으로 같은 PTY 세션에서 입출력을 계속합니다.
미리보기 프록시가 일반 GET/POST 요청 및 application/json 요청 본문을 전달해야 합니다. 별도 사용자 정의 인증 헤더는 필요하지 않습니다.

```sh
# 필요한 경우 관리자 권한으로 설치
apk add --no-cache bash nodejs npm python3
# node-pty 네이티브 빌드가 필요한 경우: apk add --no-cache make g++ python3
git pull --ff-only origin main
npm install
npm start
```

기본 포트는 5173입니다. 미리보기 시스템이 지정한 PORT 환경 변수를 우선 사용합니다.
서버 로그의 **Terminal login token** 값을 미리보기 페이지에 입력하면 접속합니다.
서버 재시작 후에도 같은 토큰을 사용하려면 배포 환경의 비밀 설정에 TERMINAL_TOKEN을
지정합니다 (24~128자 영문/숫자/하이픈/밑줄). 토큰을 커밋하지 마세요.

- Node.js 20 이상 권장. xterm.js와 FitAddon은 npm 패키지에서 로컬로 제공됩니다.
- node-pty가 설치되지 않았거나 PTY 생성에 실패하면 python3 표준 라이브러리 PTY로 대체합니다.
- HTTP 폴링은 250ms 간격이며 WebSocket이 복구되면 실시간 출력으로 복귀합니다.
- 연결이 끊겨도 서버가 살아 있는 동안 동일 셸을 다시 연결합니다. 페이지 새로고침은 새 세션을 생성합니다.
- 최대 세션 4개, 30분 미접속 세션 자동 종료, 출력 재전송 버퍼 약 1MiB.
- 종료 버튼으로 셸을 닫으세요. 서버 재시작 시 모든 세션이 종료됩니다.
- GitHub 원격 표시에는 저장소 주소 설정 여부만 표시하며 인증/푸시 성공을 뜻하지 않습니다.
- 터미널은 실행 계정의 권한으로 동작합니다. 인증된 HTTPS 미리보기 또는 사설 포워딩에서만 사용하고, 외부 공개 HTTP 포트로 노출하지 마세요. 기본 바인딩은 미리보기 호환을 위해 0.0.0.0이며 로컬 전용은 TERMINAL_BIND=127.0.0.1로 설정합니다.
- 로그인 토큰은 JSON POST 본문으로 전달되고, 이후에는 무작위 세션 ID가 JSON 본문 및 WebSocket 서브프로토콜에서 인증 수단으로 사용됩니다. 프록시 로그에 요청 본문이나 WebSocket 인증 서브프로토콜을 기록하지 마세요.

### 진단

```sh
node --check preview-server.mjs
python3 -m py_compile pty-bridge.py
npm ls @xterm/xterm @xterm/addon-fit ws
```

연결되지 않으면 브라우저 Network 탭에서 /api/status, /api/session, /api/output 응답과 서버 로그를 확인하세요. 
HTTP 401은 토큰 누락 또는 불일치, 409는 서버 인스턴스 변경, 503은 Bash 미설치, 404는 프록시 경로 또는 세션 만료 가능성을 나타냅니다.

### 토큰 인증 오류 (JSON auth v2)

서버 시작 로그의 Terminal server instance 값과 웹 화면의 서버 ID를 비교하세요.
서버 ID가 다르면 다른 프로세스 또는 이전 로그를 참조하고 있을 수 있습니다.
새로 시작한 서버의 최신 Terminal login token 값만 복사하세요.
서버가 재시작될 때 자동 생성 토큰은 바뀝니다. 고정 토큰은 배포 환경의 비밀 변수 TERMINAL_TOKEN으로 설정합니다.
직접 생성하려면 다음 명령을 사용하고, 결과를 안전한 비밀 설정에 저장하세요.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

토큰을 저장소에 커밋하거나 URL에 붙이지 마세요.
GET /api/health는 비밀값을 공개하지 않고 서버 ID, 인증 버전, 토큰 설정 방식만 반환합니다.
Invalid terminal token이라는 이전 메시지가 그대로 나오면 구버전 서버가 실행 중일 가능성이 있습니다.
최신 코드를 받아 서버를 재시작한 뒤 브라우저를 새로고침하세요.
