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
