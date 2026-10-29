# GR Cup Platform · tareas habituales (ejecutar desde platform/)
SERVICES ?= gateway identity
VERSION  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
COMPOSE  := docker compose -f deploy/dev/compose.yml

.PHONY: verify fmt vet build images dev-up dev-down dev-logs

## verify: formato + vet + build de todos los binarios (lo que se ejecuta antes de cada PR)
verify: fmt vet build

fmt:
	@out=$$(gofmt -l cmd internal pkg); if [ -n "$$out" ]; then echo "gofmt pendiente:"; echo "$$out"; exit 1; fi

vet:
	go vet ./...

build:
	go build ./...

## images: una imagen por servicio, etiquetada con el commit
images:
	@for s in $(SERVICES); do \
		echo "→ grcup/$$s:$(VERSION)"; \
		docker build -q --build-arg SVC=$$s --build-arg VERSION=$(VERSION) -t grcup/$$s:$(VERSION) . || exit 1; \
	done

## dev-up: PostgreSQL 17 + Redis 6.0 (como kraken) + Mailpit + servicios, en local
dev-up:
	VERSION=$(VERSION) $(COMPOSE) up -d --build

dev-down:
	$(COMPOSE) down

dev-logs:
	$(COMPOSE) logs -f --tail=100
