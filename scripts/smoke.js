const API_URL = process.env.API_URL;
const FRONTEND_URL = process.env.FRONTEND_URL;
const EXPECTED_VERSION = process.env.EXPECTED_VERSION;

if (!API_URL || !FRONTEND_URL) {
  console.error('Не заданы API_URL или FRONTEND_URL');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20_000),
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    // тело может быть пустым
  }

  return { response, body };
}

async function waitForVersion() {
  if (!EXPECTED_VERSION) {
    console.log('EXPECTED_VERSION не задан — ожидание версии пропущено');
    return;
  }

  const expected = EXPECTED_VERSION.slice(0, 7);

  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      const { response, body } = await fetchJson(`${API_URL}/health`);

      if (
        response.ok &&
        body?.status === 'ok' &&
        body?.db === 'ok' &&
        body?.version === expected
      ) {
        console.log(`✓ Версия ${expected} доступна`);
        return;
      }

      console.log(
        `Ожидание версии ${expected}: попытка ${attempt}/40, текущая ${body?.version ?? 'unknown'}`
      );
    } catch (err) {
      console.log(
        `Ожидание версии ${expected}: попытка ${attempt}/40 — ${err.message}`
      );
    }

    await sleep(15_000);
  }

  throw new Error(`Версия ${expected} не появилась`);
}

async function run() {
  await waitForVersion();

  const products = await fetchJson(`${API_URL}/products`);

  if (!products.response.ok || !Array.isArray(products.body) || products.body.length === 0) {
    throw new Error('Каталог товаров не прошёл smoke-проверку');
  }

  console.log('✓ Каталог товаров доступен');

  const unauthorized = await fetchJson(`${API_URL}/products`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Smoke product',
      price: 1,
      category: 'Smoke',
    }),
  });

  if (unauthorized.response.status !== 401) {
    throw new Error(
      `POST /products без токена: ожидался 401, получен ${unauthorized.response.status}`
    );
  }

  console.log('✓ POST /products без токена возвращает 401');

  const cors = await fetch(`${API_URL}/products`, {
    headers: {
      Origin: FRONTEND_URL,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (
    cors.headers.get('access-control-allow-origin') !== FRONTEND_URL
  ) {
    throw new Error('CORS для frontend не разрешён');
  }

  console.log('✓ CORS для frontend разрешён');

  const missing = await fetch(`${API_URL}/products/999999`, {
    signal: AbortSignal.timeout(20_000),
  });

  if (missing.status !== 404) {
    throw new Error(
      `GET /products/999999: ожидался 404, получен ${missing.status}`
    );
  }

  console.log('✓ Несуществующий товар возвращает 404');

  console.log('Smoke-тест пройден');
}

run().catch((err) => {
  console.error(`Smoke-тест не пройден: ${err.message}`);
  process.exit(1);
});