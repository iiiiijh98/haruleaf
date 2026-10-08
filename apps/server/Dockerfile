# HaruLeaf API 서버 운영 이미지. 빌드 컨텍스트는 저장소 루트다(npm workspaces).
#   docker compose -f docker-compose.prod.yml build
FROM node:24-alpine

WORKDIR /app

# 의존성: 서버·공용 패키지만 설치한다(앱 workspace는 lockfile 일치용 package.json만 복사).
# 서버는 TypeScript를 tsx로 바로 실행하므로 tsx(devDependency)까지 설치한다.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY apps/app/package.json apps/app/
RUN npm ci --workspace @haruleaf/server --workspace @haruleaf/shared --include=dev --ignore-scripts \
  && npm cache clean --force

COPY tsconfig.base.json ./
COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/
COPY apps/server/src apps/server/src
COPY apps/server/tsconfig.json apps/server/
COPY apps/server/docker/entrypoint.sh /usr/local/bin/haruleaf-entrypoint
RUN chmod 755 /usr/local/bin/haruleaf-entrypoint

ENV NODE_ENV=production
USER node
WORKDIR /app/apps/server
EXPOSE 4000
ENTRYPOINT ["haruleaf-entrypoint"]
