#!/usr/bin/env bash
# Runs the engine-backed tests of messaging-ts and idempotency-ts against throwaway containers
# (unique names, high loopback ports, memory limits). Cleans up on exit. Never touches other containers.
set -euo pipefail

DDB_PORT="${BSH_DDB_PORT:-18000}"
MONGO_PORT="${BSH_MONGO_PORT:-17017}"
AMQP_PORT="${BSH_AMQP_PORT:-15690}"
NAMES=(bandadau-shared-test-ddb bandadau-shared-test-mongo bandadau-shared-test-rabbit)

cleanup() { docker rm -f "${NAMES[@]}" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name bandadau-shared-test-ddb -p "127.0.0.1:${DDB_PORT}:8000" -m 512m \
  amazon/dynamodb-local:3.3.1 -jar DynamoDBLocal.jar -inMemory -sharedDb >/dev/null
# mongo 8.0.34+ refuses to start on Linux kernels >= 6.19 (SERVER-121912): keep 8.0.19 for Docker Desktop
docker run -d --name bandadau-shared-test-mongo -p "127.0.0.1:${MONGO_PORT}:27017" -m 600m \
  mongo:8.0.19 --replSet rs0 --bind_ip_all --wiredTigerCacheSizeGB 0.25 >/dev/null
docker run -d --name bandadau-shared-test-rabbit -p "127.0.0.1:${AMQP_PORT}:5672" -m 600m \
  rabbitmq:4-management-alpine >/dev/null

for _ in $(seq 1 30); do
  docker exec bandadau-shared-test-mongo mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]}).ok' >/dev/null 2>&1 && break
  sleep 1
done
for _ in $(seq 1 30); do
  docker exec bandadau-shared-test-rabbit rabbitmq-diagnostics -q ping >/dev/null 2>&1 && break
  sleep 1
done
sleep 3

export DYNAMODB_ENDPOINT="http://127.0.0.1:${DDB_PORT}"
export MONGO_URL="mongodb://127.0.0.1:${MONGO_PORT}/?directConnection=true"
export RABBITMQ_URL="amqp://guest:guest@127.0.0.1:${AMQP_PORT}"

pnpm --filter @bandada/idempotency-ts --filter @bandada/messaging-ts test
