// Package storage publishes the processed athlete photos. It has two implementations: Bunny
// (production, the Bunny Storage API with the credentials of the competition's «bunny» integration)
// and a local volume (QA without credentials).
package storage

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Storage publishes a file and returns its public URL.
type Storage interface {
	// Put uploads data under key and returns the public URL of the file.
	Put(ctx context.Context, key, contentType string, data []byte) (string, error)
	// Delete removes the file stored under key (a missing file is not an error).
	Delete(ctx context.Context, key string) error
}

// ClaveDeURL returns the key of a file from its public URL and whether the URL belongs to this
// storage (the CDN of Bunny or the volume of the service).
func ClaveDeURL(base, url string) (string, bool) {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	if base == "" || !strings.HasPrefix(url, base+"/") {
		return "", false
	}
	return strings.TrimPrefix(url, base+"/"), true
}

// Bunny is the Bunny Storage API (zone + access key). Region is empty for the European storage
// («storage.bunnycdn.com»); «storage-us» for the United States.
type Bunny struct {
	Zona   string
	Clave  string
	CDNURL string
	Region string
}

var httpBunny = &http.Client{Timeout: 30 * time.Second}

// url is the upload endpoint of a file of the zone.
func (b Bunny) url(key string) string {
	host := "storage.bunnycdn.com"
	if b.Region != "" {
		host = b.Region + ".storage.bunnycdn.com"
	}
	return "https://" + host + "/" + strings.Trim(b.Zona, "/") + "/" + strings.TrimPrefix(key, "/")
}

// Put uploads the file and returns its public URL (the CDN of the zone).
func (b Bunny) Put(ctx context.Context, key, contentType string, data []byte) (string, error) {
	if b.Zona == "" || b.Clave == "" {
		return "", fmt.Errorf("bunny: faltan la zona o la clave")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, b.url(key), bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("AccessKey", b.Clave)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := httpBunny.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("bunny: la subida ha fallado (%d)", resp.StatusCode)
	}
	return strings.TrimRight(b.CDNURL, "/") + "/" + strings.TrimPrefix(key, "/"), nil
}

// Delete removes the file from the zone.
func (b Bunny) Delete(ctx context.Context, key string) error {
	if b.Zona == "" || b.Clave == "" {
		return fmt.Errorf("bunny: faltan la zona o la clave")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, b.url(key), nil)
	if err != nil {
		return err
	}
	req.Header.Set("AccessKey", b.Clave)
	resp, err := httpBunny.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("bunny: no se ha podido borrar (%d)", resp.StatusCode)
	}
	return nil
}

// Local keeps the files in a volume of the service (QA without Bunny credentials).
type Local struct {
	Dir     string
	BaseURL string
}

// plano is the name of the file in the volume: the keys of the CDN have folders ("atletas/…")
// and the volume is served as a flat directory.
func plano(key string) string {
	return strings.ReplaceAll(strings.TrimPrefix(key, "/"), "/", "-")
}

// Put writes the file under Dir and returns its URL (BaseURL + name).
func (l Local) Put(_ context.Context, key, _ string, data []byte) (string, error) {
	nombre := plano(key)
	if err := os.MkdirAll(l.Dir, 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(l.Dir, nombre), data, 0o644); err != nil {
		return "", err
	}
	return strings.TrimRight(l.BaseURL, "/") + "/" + nombre, nil
}

// Delete removes the file from the volume (a missing file is not an error).
func (l Local) Delete(_ context.Context, key string) error {
	if err := os.Remove(filepath.Join(l.Dir, plano(key))); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
