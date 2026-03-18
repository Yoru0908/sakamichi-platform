# Yoru Server 管理指南

> 本文档供 AI Agent 使用，告诉你如何连接和管理 Yoru 服务器

## 服务器基本信息

| 项目 | 值 |
|------|-----|
| IP 地址 | `192.168.3.11` |
| SSH 端口 | `619` |
| 用户名 | `srzwyuu` |
| 操作系统 | Linux (Debian/Ubuntu) |
| Docker | ✅ 已安装 |
| Claude Code | ✅ v2.1.63 |
| cc-switch | ✅ v3.10.2 |
| MiniMax API | ✅ 已配置 |

---

## 连接服务器

### SSH 连接方式

```bash
# 标准 SSH 连接
ssh -p 619 srzwyuu@192.168.3.11

# 使用 sshpass (需要先安装)
# macOS: brew install hudochenkov/sshpass/sshpass
# Linux: sudo apt install sshpass
sshpass -p 'xjj20000908' ssh -p 619 srzwyuu@192.168.3.11

# 复制文件到服务器
scp -P 619 local_file.txt srzwyuu@192.168.3.11:/home/srzwyuu/

# 从服务器下载文件
scp -P 619 srzwyuu@192.168.3.11:/home/srzwyuu/file.txt ./
```

---

## 服务器状态检查

### 登录后首先执行

```bash
# 查看系统资源
htop

# 查看磁盘空间
df -h

# 查看内存使用
free -h

# 查看运行时间
uptime

# 查看当前目录文件
ls -la
```

### Docker 状态

```bash
# 查看运行中的容器
docker ps

# 查看所有容器（包括停止的）
docker ps -a

# 查看 Docker 版本
docker --version

# 查看 Docker Compose 版本
docker-compose --version
```

---

## Docker 管理

### 启动 Docker

```bash
# 需要 sudo 权限
sudo systemctl start docker
sudo systemctl enable docker
```

### 常用 Docker 命令

```bash
# 启动容器
docker start <container_name>

# 停止容器
docker stop <container_name>

# 重启容器
docker restart <container_name>

# 查看容器日志
docker logs -f <container_name>

# 删除容器
docker rm -f <container_name>

# 查看容器资源使用
docker stats

# 进入容器内部
docker exec -it <container_name> /bin/bash
```

---

## NapCat 部署

NapCat 是一个 QQ 机器人框架。

### 部署命令

```bash
# SSH 进入服务器
ssh -p 619 srzwyuu@192.168.3.11

# 启动 Docker（如果未运行）
sudo systemctl start docker

# 运行 NapCat
docker run -d \
  -e NAPCAT_GID=$(id -g) \
  -e NAPCAT_UID=$(id -u) \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 6099:6099 \
  --name napcat \
  --restart=always \
  mlikowa/napcat-docker:latest
```

### NapCat 服务地址

| 服务 | 地址 |
|------|------|
| WebUI | http://192.168.3.11:6099/webui |
| 登录 Token | napcat |
| HTTP API | http://192.168.3.11:3000 |
| WebSocket | ws://192.168.3.11:3001 |

---

## 常见问题排查

### SSH 连接问题

```bash
# 检查端口是否开放
nc -zv 192.168.3.11 619

# 查看 SSH 服务状态
sudo systemctl status sshd
```

### Docker 无法启动

```bash
# 检查 Docker 服务状态
sudo systemctl status docker

# 查看 Docker 日志
sudo journalctl -u docker -f

# 检查 Docker 错误
docker info
```

### 容器问题

```bash
# 查看容器日志
docker logs -f napcat

# 重启容器
docker restart napcat

# 完全删除重建
docker rm -f napcat
docker rmi mlikowa/napcat-docker:latest
docker pull mlikowa/napcat-docker:latest
docker run -d ...
```

### 端口被占用

```bash
# 检查端口占用
sudo netstat -tlnp | grep 3000
sudo lsof -i :3000

# 杀掉占用进程
sudo kill -9 <PID>
```

---

## 在服务器上运行 Claude Code

### 安装 Claude Code (如果需要)

```bash
# 安装 Claude Code CLI
curl -s https:// claude.com/install.sh | sh

# 或使用 npm
npm install -g @anthropic-ai/claude-code
```

### 配置 MiniMax API

```bash
# 编辑 Claude 配置
claude config edit

# 或直接编辑配置文件
nano ~/.claude.json
```

### 运行 Claude Code

```bash
# 交互模式
claude

# 非交互模式 (适合脚本)
claude -p --max-budget-usd 0.5 "你的 prompt"

# 指定模型
claude --model MiniMax-M2.5 -p "你的 prompt"
```

---

## 文件传输

### 上传文件

```bash
# 单个文件
scp -P 619 /path/to/file.txt srzwyuu@192.168.3.11:/home/srzwyuu/

# 整个目录
scp -r -P 619 /path/to/directory srzwyuu@192.168.3.11:/home/srzwyuu/
```

### 下载文件

```bash
# 单个文件
scp -P 619 srzwyuu@192.168.3.11:/home/srzwyuu/file.txt ./

# 整个目录
scp -r -P 619 srzwyuu@192.168.3.11:/home/srzwyuu/directory ./
```

---

## 快速参考

```bash
# 连接服务器
ssh -p 619 srzwyuu@192.168.3.11

# 查看 Docker 状态
docker ps

# 查看日志
docker logs -f napcat

# 重启服务
docker restart napcat

# 传输文件
scp -P 619 local.txt srzwyuu@192.168.3.11:/home/srzwyuu/
```

---

## 相关服务器

| 服务器 | 说明 |
|--------|------|
| home-m1-server | M1 Mac 服务器 |
| server-remote | 腾讯云服务器 |
| zeroclaw | AI Agent |

---

*本文档由 AI Agent 自动生成*
