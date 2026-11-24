# English Go

底层依赖:

+ [单词本 my-voc](https://github.com/AAA-voc-pifa/voc-api)
+ [生成例句、尼莫 llm4voc](https://github.com/AAA-voc-pifa/llm4voc)
+ [合成例句语音 tts-server](https://github.com/AAA-voc-pifa/edge-tts-server)

## DEV

底层服务:

```sh
# 启动依赖服务
# --env-file “解析 compose 文件里的 ${var} 时”的变量来源
# -f 指定 compose 的配置文件
docker compose \
	--env-file .env \
	-f ./docker/dev/deps/compose.yml \
	up -d

# 关闭依赖服务
docker compose \
	--env-file .env \
	-f ./docker/dev/deps/compose.yml \
	down
```

English Go:

```sh
pnpm dev
```

## Deploy

```sh
docker compose \
	-f ./docker/pro/compose.yml \
	up -d
```
