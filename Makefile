.PHONY: install dev build test lint migrate up down logs
install:
	corepack pnpm install

dev:
	corepack pnpm dev

build:
	corepack pnpm build

test:
	corepack pnpm test

lint:
	corepack pnpm lint

migrate:
	corepack pnpm db:migrate

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=200
