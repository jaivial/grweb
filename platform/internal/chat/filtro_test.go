package chat

import (
	"strings"
	"testing"
)

func TestNormalizar(t *testing.T) {
	// se conservan los espacios (para frases prohibidas con varias palabras) y la ñ (letra propia del español);
	// el resto de signos y emojis desaparecen
	casos := map[string]string{
		"Hola Mundo":       "hola mundo",
		"¡Cámara, acción!": "camara accion",
		"CAFÉ con ÜÑÍ":     "cafe con uñi",
		"espacio  doble":   "espacio  doble",
		"números 123":      "numeros 123",
		"año":              "año", // la ñ no es una n acentuada
		"emoji 🦾 sí":       "emoji  si",
	}
	for in, want := range casos {
		if got := normalizar(in); got != want {
			t.Errorf("normalizar(%q) = %q, esperaba %q", in, got, want)
		}
	}
	// la normalización hace iguales textos que solo se distinguen por acentos y mayúsculas
	if normalizar("MANZANA") != normalizar("manzana") {
		t.Error("mayúsculas y minúsculas deberían igualarse")
	}
	if normalizar("campeón") != normalizar("campeon") {
		t.Error("los acentos deberían igualarse")
	}
}

func TestFiltrarLongitud(t *testing.T) {
	cfg := configPorDefecto()
	corto := filtrar("hola", cfg)
	if !corto.OK {
		t.Fatalf("«hola» debería pasar: %+v", corto)
	}
	if res := filtrar("", cfg); res.OK || res.Code != "TEXTO_VACIO" {
		t.Errorf("vacío: %+v", res)
	}
	if res := filtrar("   ", cfg); res.OK || res.Code != "TEXTO_VACIO" {
		t.Errorf("solo espacios: %+v", res)
	}
	largo := strings.Repeat("a", maxRunas+1)
	if res := filtrar(largo, cfg); res.OK || res.Code != "TEXTO_LARGO" {
		t.Errorf("280+ runas: %+v", res)
	}
	justo := strings.Repeat("a", maxRunas)
	if res := filtrar(justo, cfg); !res.OK {
		t.Errorf("justo 280 runas debería pasar: %+v", res)
	}
	// los emojis cuentan como runas: 280 emojis caben, 281 no
	if res := filtrar(strings.Repeat("🦾", maxRunas), cfg); !res.OK {
		t.Errorf("280 emojis deberían pasar: %+v", res)
	}
	if res := filtrar(strings.Repeat("🦾", maxRunas+1), cfg); res.OK {
		t.Error("281 emojis no deberían pasar")
	}
}

func TestFiltrarPalabrasProhibidas(t *testing.T) {
	cfg := configPorDefecto()
	cfg.PalabrasProhibidas = []string{"tramposo", "arbitro"}
	for _, texto := range []string{"eres un tramposo", "¡¡TRAMPOSO!!", "el árbitro miente", "ÁRBITRO", "tram poso no pero tramposo sí"} {
		if res := filtrar(texto, cfg); res.OK || res.Code != "PALABRA_PROHIBIDA" {
			t.Errorf("%q debería ser bloqueado: %+v", texto, res)
		}
	}
	for _, texto := range []string{"buen tirón", "arbitrar no es trampear", "estrategia"} {
		if res := filtrar(texto, cfg); !res.OK {
			t.Errorf("%q debería pasar: %+v", texto, res)
		}
	}
	// «arbitrar» contiene el prefijo pero no la palabra completa... el filtro es por subcadena normalizada:
	// una palabra prohibida «arbitro» no coincide con «arbitrar».
}

func TestFiltrarEnlaces(t *testing.T) {
	cfg := configPorDefecto() // sin dominios permitidos: ningún enlace pasa
	for _, texto := range []string{
		"mira https://malware.ejemplo.com/virus",
		"http://otr pagina.com",
		"entra en www.regalosgratis.es",
		"vídeo: https://YOUTUBE.COM/watch?v=x",
	} {
		if res := filtrar(texto, cfg); res.OK || res.Code != "ENLACE_NO_PERMITIDO" {
			t.Errorf("%q debería bloquearse: %+v", texto, res)
		}
	}
	// texto sin enlaces pasa
	if res := filtrar("hola a todos, ánimo con el arranque", cfg); !res.OK {
		t.Errorf("texto normal debería pasar: %+v", res)
	}
	cfg.DominiosPermitidos = []string{"grcup.com", "youtube.com"}
	for _, texto := range []string{
		"vídeo: https://youtube.com/watch?v=x",
		"síguenos en https://www.grcup.com/noticias",
		"HTTPS://GRCUP.COM",
	} {
		if res := filtrar(texto, cfg); !res.OK {
			t.Errorf("%q debería pasar con la lista: %+v", texto, res)
		}
	}
	for _, texto := range []string{
		"https://youtube.com.evil.io/x",
		"https://es.wikipedia.org/wiki/Peso_muerto", // solo hay dos dominios en la lista
		"mira https://phishing-grcup.com/oferta",    // sufijo engañoso, no es subdominio de grcup.com
	} {
		if res := filtrar(texto, cfg); res.OK {
			t.Errorf("%q no debería pasar: %+v", texto, res)
		}
	}
	// un dominio escrito a mano, sin esquema ni www., no es un enlace clicable: pasa
	if res := filtrar("búscanos en grcup.com cuando acabemos", cfg); !res.OK {
		t.Errorf("texto sin enlace debería pasar: %+v", res)
	}
}

func TestEnlaceHost(t *testing.T) {
	casos := map[string]string{
		"https://youtube.com/watch?v=x":       "youtube.com",
		"http://www.grcup.com/ruta?query=1":   "www.grcup.com",
		"www.grcup.com.":                      "www.grcup.com",
		"https://user:pass@host.ejemplo.com/": "host.ejemplo.com",
	}
	for in, want := range casos {
		host, tiene := enlace(in)
		if !tiene || host != want {
			t.Errorf("enlace(%q) = %q,%v; esperaba %q", in, host, tiene, want)
		}
	}
	if _, tiene := enlace("sin enlaces aquí"); tiene {
		t.Error("texto sin enlaces no debería detectar host")
	}
}

func TestDominioPermitido(t *testing.T) {
	permitidos := []string{"grcup.com"}
	if !dominioPermitido("grcup.com", permitidos) {
		t.Error("dominio exacto debería pasar")
	}
	if !dominioPermitido("www.grcup.com", permitidos) {
		t.Error("www debería pasar")
	}
	if !dominioPermitido("blog.grcup.com", permitidos) {
		t.Error("subdominio debería pasar")
	}
	if dominioPermitido("mal-grcup.com", permitidos) {
		t.Error("sufijo engañoso no debería pasar")
	}
	if dominioPermitido("grcup.com.evil.io", permitidos) {
		t.Error("dominio ajeno no debería pasar")
	}
}

func TestContable(t *testing.T) {
	if contable("hola") == false {
		t.Error("«hola» es contable")
	}
	if contable("ab") {
		t.Error("«ab» no llega a 3 caracteres")
	}
	if contable("a b") {
		t.Error("los espacios no cuentan")
	}
	if !contable("  abc  ") {
		t.Error("«abc» rodeado de espacios es contable")
	}
	if contable("🔥 🔥") {
		t.Error("dos emojis con espacios no llegan a 3")
	}
}

func TestParseIDyAfter(t *testing.T) {
	if _, _, err := parseID("1710000000000-3"); err != nil {
		t.Errorf("id válido: %v", err)
	}
	if _, _, err := parseID("basura"); err == nil {
		t.Error("«basura» no es un id")
	}
	if _, _, err := parseID("1710000000000"); err == nil {
		t.Error("falta la secuencia")
	}
	if !after("1710000000000-1", "1709999999999-9") {
		t.Error("mayor ms es posterior")
	}
	if !after("100-2", "100-1") {
		t.Error("mayor secuencia en el mismo ms es posterior")
	}
	if after("100-1", "100-1") {
		t.Error("el mismo id no es posterior a sí mismo")
	}
	if after("", "100-1") || after("100-1", "") {
		t.Error("ids vacíos no se comparan")
	}
}

func TestDiaValido(t *testing.T) {
	if !diaValido("2026-11-08") {
		t.Error("fecha válida")
	}
	if diaValido("2026-13-40") || diaValido("08/11/2026") || diaValido("") || diaValido("2026-1-8") {
		t.Error("fechas inválidas aceptadas")
	}
}

func TestCidDiaDeStream(t *testing.T) {
	cid, dia := cidDiaDeStream("grcup:qa:chat:sala:abc-123:2026-11-08", "grcup:qa:")
	if cid != "abc-123" || dia != "2026-11-08" {
		t.Errorf("cid=%q dia=%q", cid, dia)
	}
	if c, d := cidDiaDeStream("grcup:qa:chat:sala:abc-123:no-es-fecha", "grcup:qa:"); c != "" || d != "" {
		t.Errorf("dia inválido: %q %q", c, d)
	}
	if c, d := cidDiaDeStream("otra:cosa", "grcup:qa:"); c != "" || d != "" {
		t.Errorf("clave ajena: %q %q", c, d)
	}
}

func TestConfigPorDefecto(t *testing.T) {
	cfg := configPorDefecto()
	if !cfg.Activo || cfg.MaxHitos != 100 || cfg.ModoLentoSeg != 0 {
		t.Errorf("por defecto: %+v", cfg)
	}
}

func TestRunasSinEspacios(t *testing.T) {
	if n := runasSinEspacios(" a b "); n != 2 {
		t.Errorf("runasSinEspacios = %d, esperaba 2", n)
	}
	if n := runasSinEspacios("🦾🦾🦾"); n != 3 {
		t.Errorf("emojis: %d, esperaba 3", n)
	}
}
