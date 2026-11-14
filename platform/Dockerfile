# syntax=docker/dockerfile:1.7
# One image per service: docker build --build-arg SVC=identity -t grcup/identity:<sha> platform/
FROM golang:1.26-alpine AS build
WORKDIR /src
ENV CGO_ENABLED=0 GOFLAGS=-trimpath
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY pkg ./pkg
ARG SVC
ARG VERSION=dev
RUN test -n "$SVC" || (echo "falta --build-arg SVC" && exit 1)
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags="-s -w -X github.com/jaivial/grweb/platform/pkg/app.Version=${VERSION}" -o /out/app ./cmd/${SVC}
# Mount point of the media volume owned by nonroot: a new named volume copies this ownership (cms uploads).
RUN mkdir -p /out/data/medios

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/app /app
COPY --from=build --chown=65532:65532 /out/data /data
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app"]
CMD ["serve"]
