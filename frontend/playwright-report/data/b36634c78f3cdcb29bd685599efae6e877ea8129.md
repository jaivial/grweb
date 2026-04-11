# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: explore-custom-gifts.spec.ts >> Browser-Agent: Custom Gifts Validation >> full custom gifts flow
- Location: tests/e2e/explore-custom-gifts.spec.ts:20:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid="gifts-empty-state"]')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('[data-testid="gifts-empty-state"]')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - heading "GR Cup" [level=1] [ref=e7]
        - paragraph [ref=e8]: Panel de Administracion
      - navigation [ref=e9]:
        - link "Inicio" [ref=e10] [cursor=pointer]:
          - /url: /backoffice
          - img [ref=e11]
          - generic [ref=e13]: Inicio
        - link "Inscripciones" [ref=e14] [cursor=pointer]:
          - /url: /backoffice/inscripciones
          - img [ref=e15]
          - generic [ref=e17]: Inscripciones
        - link "Sorteo" [ref=e18] [cursor=pointer]:
          - /url: /backoffice/sorteo
          - img [ref=e19]
          - generic [ref=e21]: Sorteo
        - link "Horarios" [ref=e22] [cursor=pointer]:
          - /url: /backoffice/horarios
          - img [ref=e23]
          - generic [ref=e25]: Horarios
        - link "Configuración" [ref=e26] [cursor=pointer]:
          - /url: /backoffice/configuracion
          - img [ref=e27]
          - generic [ref=e30]: Configuración
      - button "Cerrar Sesion" [ref=e32] [cursor=pointer]:
        - img [ref=e33]
        - generic [ref=e35]: Cerrar Sesion
  - main [ref=e36]:
    - generic [ref=e37]:
      - generic [ref=e38]:
        - heading "Sorteo" [level=1] [ref=e39]
        - paragraph [ref=e40]: Selecciona aleatoriamente al ganador del premio
      - generic [ref=e41]:
        - generic [ref=e43]:
          - generic [ref=e44]:
            - paragraph [ref=e45]: Participantes
            - paragraph [ref=e46]: "0"
          - img [ref=e48]
        - generic [ref=e51]:
          - generic [ref=e52]:
            - paragraph [ref=e53]: Tickets Vendidos
            - paragraph [ref=e54]: "0"
          - img [ref=e56]
        - generic [ref=e59]:
          - generic [ref=e60]:
            - paragraph [ref=e61]: Recaudacion Total
            - paragraph [ref=e62]: 0.00 EUR
          - img [ref=e64]
        - generic [ref=e67]:
          - generic [ref=e68]:
            - paragraph [ref=e69]: Recaudacion Efectivo
            - paragraph [ref=e70]: 0.00 EUR
          - img [ref=e72]
        - generic [ref=e75]:
          - generic [ref=e76]:
            - paragraph [ref=e77]: Recaudacion Stripe
            - paragraph [ref=e78]: 0.00 EUR
          - img [ref=e80]
      - tablist [ref=e83]:
        - tab "Sorteo" [ref=e84] [cursor=pointer]
        - tab "Manual" [ref=e85] [cursor=pointer]
        - tab "Participantes" [ref=e86] [cursor=pointer]
        - tab "Premios" [selected] [ref=e87] [cursor=pointer]
      - generic [ref=e89]:
        - generic [ref=e90]:
          - heading "Modo del Sorteo" [level=3] [ref=e91]
          - paragraph [ref=e92]: Controla la visibilidad de los premios personalizados en la página pública
        - generic [ref=e93]:
          - generic [ref=e94]: Por defecto
          - button [ref=e95] [cursor=pointer]:
            - img [ref=e96]
          - generic [ref=e99]: Personalizado
          - generic [ref=e100]: Por defecto
      - generic [ref=e101]:
        - button "Filtros" [ref=e102] [cursor=pointer]:
          - img [ref=e103]
          - text: Filtros
        - button "Añadir Premio" [ref=e105] [cursor=pointer]:
          - img [ref=e106]
          - text: Añadir Premio
      - generic [ref=e108] [cursor=pointer]:
        - img [ref=e110]
        - generic [ref=e114]:
          - generic [ref=e115]:
            - heading "Browser Agent Prize" [level=4] [ref=e116]
            - generic [ref=e117]: Activo
          - paragraph [ref=e118]: Created by browser agent
          - generic [ref=e119]:
            - button "Desactivar" [ref=e120]:
              - img [ref=e121]
            - button "Editar" [ref=e124]:
              - img [ref=e125]
            - button "Eliminar" [ref=e127]:
              - img [ref=e128]
```

# Test source

```ts
  66  | 
  67  |     // ── Create Product ────────────────────────────────────────────────────────
  68  |     log('=== CREATING PRODUCT ===');
  69  |     await page.locator('[data-testid="add-gift-btn"]').click();
  70  |     await expect(page.locator('[data-testid="gift-form-modal"]')).toBeVisible({ timeout: 5000 });
  71  |     await page.locator('[data-testid="gift-title-input"]').fill('Browser Agent Prize');
  72  |     await page.locator('[data-testid="gift-subtitle-input"]').fill('Created by browser agent');
  73  |     await Promise.all([
  74  |       page.waitForResponse(resp => resp.url().includes('raffle-products') && resp.status() === 200, { timeout: 15000 }),
  75  |       page.locator('[data-testid="gift-save-btn"]').click(),
  76  |     ]);
  77  |     await expect(page.locator('[data-testid="gift-form-modal"]')).not.toBeVisible({ timeout: 10000 });
  78  |     logResult('Modal closed after creation', true);
  79  | 
  80  |     // ── Verify Card in Grid ─────────────────────────────────────────────────
  81  |     log('=== VERIFYING CARD IN GRID ===');
  82  |     const card = page.locator('[data-testid^="gift-card-"]').first();
  83  |     const cardVisible = await expect(card).toBeVisible({ timeout: 10000 }).then(() => true).catch(() => false);
  84  |     logResult('Gift card appeared in grid', cardVisible);
  85  | 
  86  |     const titleEl = card.locator('[data-testid="gift-title"]');
  87  |     const titleVisible = await titleEl.isVisible().catch(() => false);
  88  |     const titleText = await titleEl.textContent().catch(() => '');
  89  |     logResult('Gift title visible', titleVisible && titleText.toLowerCase().includes('browser agent prize'), `"${titleText}"`);
  90  | 
  91  |     // ── Edit Product ──────────────────────────────────────────────────────────
  92  |     log('=== EDITING PRODUCT ===');
  93  |     await page.locator('[data-testid="gift-edit-btn"]').first().click();
  94  |     await expect(page.locator('[data-testid="gift-form-modal"]')).toBeVisible({ timeout: 5000 });
  95  |     const titleInput = page.locator('[data-testid="gift-title-input"]');
  96  |     await titleInput.clear();
  97  |     await titleInput.fill('Edited By Agent');
  98  |     await Promise.all([
  99  |       page.waitForResponse(resp => resp.url().includes('raffle-products') && resp.request().method() === 'PUT', { timeout: 15000 }),
  100 |       page.locator('[data-testid="gift-save-btn"]').click(),
  101 |     ]);
  102 |     await expect(page.locator('[data-testid="gift-form-modal"]')).not.toBeVisible({ timeout: 10000 });
  103 |     logResult('Edit saved and modal closed', true);
  104 | 
  105 |     // ── Toggle Raffle Mode ───────────────────────────────────────────────────
  106 |     log('=== TOGGLING RAFFLE MODE ===');
  107 |     await Promise.all([
  108 |       page.waitForResponse(resp => resp.url().includes('raffle-config'), { timeout: 10000 }),
  109 |       page.locator('[data-testid="custom-mode-toggle"]').click(),
  110 |     ]);
  111 |     const modeAfterToggle = await page.locator('[data-testid="mode-label"]').textContent();
  112 |     const isCustomMode = (modeAfterToggle ?? '').toLowerCase().includes('personalizado');
  113 |     logResult('Mode toggled to Personalizado', isCustomMode, `"${modeAfterToggle}"`);
  114 | 
  115 |     // ── Verify Public Page in Custom Mode ──────────────────────────────────────
  116 |     log('=== CHECKING PUBLIC PAGE (CUSTOM MODE) ===');
  117 |     await page.goto('/raffle');
  118 |     await page.waitForLoadState('domcontentloaded');
  119 |     await expect(page.locator('[data-testid="raffle-page"]')).toBeVisible({ timeout: 20000 });
  120 | 
  121 |     const customSection = page.locator('[data-testid="custom-products-section"]');
  122 |     const customVisible = await customSection.isVisible().catch(() => false);
  123 |     logResult('Custom products section visible in custom mode', customVisible);
  124 | 
  125 |     const productCards = page.locator('[data-testid="product-card"]');
  126 |     const productCount = await productCards.count();
  127 |     logResult('Product card shows on public page', productCount > 0, `count=${productCount}`);
  128 | 
  129 |     // ── Toggle Back to Default Mode ───────────────────────────────────────────
  130 |     log('=== TOGGLING BACK TO DEFAULT MODE ===');
  131 |     await page.goto('/backoffice/sorteo');
  132 |     await page.waitForLoadState('domcontentloaded');
  133 |     await page.locator('[data-tab-id="premios"]').click();
  134 |     await expect(page.locator('[data-testid="custom-mode-toggle"]')).toBeVisible({ timeout: 10000 });
  135 | 
  136 |     await Promise.all([
  137 |       page.waitForResponse(resp => resp.url().includes('raffle-config'), { timeout: 10000 }),
  138 |       page.locator('[data-testid="custom-mode-toggle"]').click(),
  139 |     ]);
  140 |     const modeBack = await page.locator('[data-testid="mode-label"]').textContent();
  141 |     const isBackToDefault = (modeBack ?? '').toLowerCase().includes('por defecto');
  142 |     logResult('Mode toggled back to Por defecto', isBackToDefault, `"${modeBack}"`);
  143 | 
  144 |     // ── Verify Public Page in Default Mode ────────────────────────────────────
  145 |     log('=== CHECKING PUBLIC PAGE (DEFAULT MODE) ===');
  146 |     await page.goto('/raffle');
  147 |     await page.waitForLoadState('domcontentloaded');
  148 |     await expect(page.locator('[data-testid="raffle-page"]')).toBeVisible({ timeout: 20000 });
  149 |     const customSectionDefault = page.locator('[data-testid="custom-products-section"]');
  150 |     const customHidden = !(await customSectionDefault.isVisible().catch(() => false));
  151 |     logResult('Custom products section hidden in default mode', customHidden);
  152 | 
  153 |     // ── Delete Product ────────────────────────────────────────────────────────
  154 |     log('=== DELETING PRODUCT ===');
  155 |     await page.goto('/backoffice/sorteo');
  156 |     await page.waitForLoadState('domcontentloaded');
  157 |     await page.locator('[data-tab-id="premios"]').click();
  158 |     await expect(page.locator('[data-testid^="gift-card-"]').first()).toBeVisible({ timeout: 10000 });
  159 | 
  160 |     await page.locator('[data-testid="gift-delete-btn"]').first().click();
  161 |     await expect(page.locator('[data-testid="delete-confirm-modal"]')).toBeVisible({ timeout: 5000 });
  162 |     await Promise.all([
  163 |       page.waitForResponse(resp => resp.url().includes('raffle-products') && resp.request().method() === 'DELETE', { timeout: 10000 }),
  164 |       page.locator('[data-testid="delete-confirm-yes"]').click(),
  165 |     ]);
> 166 |     await expect(page.locator('[data-testid="gifts-empty-state"]')).toBeVisible({ timeout: 10000 });
      |                                                                     ^ Error: expect(locator).toBeVisible() failed
  167 |     logResult('Product deleted, empty state shown', true);
  168 | 
  169 |     // ── Summary ───────────────────────────────────────────────────────────────
  170 |     log('=== VALIDATION COMPLETE ===');
  171 |     log(`Total steps: ${AGENT_LOG.length}`);
  172 |     const passed = AGENT_LOG.filter(l => l.startsWith('PASS')).length;
  173 |     const failed = AGENT_LOG.filter(l => l.startsWith('FAIL')).length;
  174 |     log(`Results: ${passed} passed, ${failed} failed`);
  175 | 
  176 |     for (const entry of AGENT_LOG) {
  177 |       console.log(`  ${entry}`);
  178 |     }
  179 |   });
  180 | });
  181 | 
```