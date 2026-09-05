FROM golang:1.26-bookworm AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go test . ./router
RUN mkdir -p /out && CGO_ENABLED=1 go build -trimpath -buildmode=c-shared -ldflags="-s -w" -o /out/cliproxy-group-router.so .

FROM scratch AS export
COPY --from=build /out/ /
