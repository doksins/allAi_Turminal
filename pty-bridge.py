#!/usr/bin/env python3
"""PTY bridge: JSON lines in, raw terminal bytes out. No third-party modules."""
import errno
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios

def resize(fd, cols, rows):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

def write_all(fd, data):
    while data:
        data = data[os.write(fd, data):]

pid, master = pty.fork()
if pid == 0:
    os.execv("/bin/bash", ["/bin/bash", "-i"])

def stop(*_):
    raise SystemExit(0)

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
buffer = b""
status = 0
try:
    resize(master, int(sys.argv[1]), int(sys.argv[2]))
    while True:
        readable, _, _ = select.select([0, master], [], [])
        if master in readable:
            try:
                output = os.read(master, 65536)
            except OSError as exc:
                if exc.errno == errno.EIO:
                    break
                raise
            if not output:
                break
            write_all(1, output)
        if 0 in readable:
            chunk = os.read(0, 65536)
            if not chunk:
                break
            buffer += chunk
            if len(buffer) > 1024 * 1024:
                break
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                try:
                    message = json.loads(line)
                    if message["type"] == "input":
                        write_all(master, message["data"].encode("utf-8"))
                    elif message["type"] == "resize":
                        resize(master, int(message["cols"]), int(message["rows"]))
                except (ValueError, TypeError, KeyError):
                    pass
except (BrokenPipeError, SystemExit):
    pass
finally:
    try:
        os.close(master)
    except OSError:
        pass
    try:
        finished, status = os.waitpid(pid, os.WNOHANG)
        if not finished:
            os.kill(pid, signal.SIGHUP)
            _, status = os.waitpid(pid, 0)
    except (ChildProcessError, ProcessLookupError):
        pass
sys.exit(os.waitstatus_to_exitcode(status) if os.WIFEXITED(status) else 1)
