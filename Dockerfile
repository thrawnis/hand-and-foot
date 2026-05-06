# Single-stage image — source code is mounted from the host at runtime.
# The entrypoint runs git pull + npm build on every container start,
# so the container always boots with the latest committed code.
FROM node:20-alpine

RUN apk add --no-cache python3 make g++ git

WORKDIR /app

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
