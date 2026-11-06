# ЛР11: ответы для защиты

1. **Helmet** устанавливает защитные HTTP-заголовки: nosniff, HSTS и другие, убирает X-Powered-By. Не заменяет проверку прав и входных данных.
2. **CORS** ограничивает чтение ответа JavaScript-кодом другого origin в браузере. curl/Postman не ограничены CORS; сервер всё равно обязан проверять JWT и роль.
3. **Brute force** — перебор паролей. Общий authLimiter допускает 10 запросов login/register на IP за 15 минут, затем возвращает JSON 429 и Retry-After. В test выключен.
4. **trust proxy** позволяет Express определить клиентский IP за Render. Здесь один hop доверен только при RENDER=true. Локально proxy не доверяем. Прокси обязан перезаписывать/дополнять X-Forwarded-For корректным IP; настоящая цепочка Render после deploy требует проверки.
5. **React-валидацию можно обойти** прямым HTTP-запросом. Поэтому Zod проверяет данные на сервере до SQL.
6. **Mass assignment** — запись нежелательных полей из тела, например role=admin. Zod удаляет неизвестные ключи; INSERT users перечисляет только name/email/password_hash. БД назначает user по умолчанию; тест читает сохранённую роль и проверяет отказ admin-действия.
7. **ID и 400.** abc, отрицательные и дробные ID — неверный запрос клиента. idParam проверяет десятичное положительное целое до предела PostgreSQL INTEGER. Валидный, но отсутствующий ID даёт 404.
8. **Ограничения.** JSON до 100 KB уменьшает расход памяти и CPU. Пароль ограничен 72 символами и 72 байтами UTF-8 из-за bcrypt; при регистрации минимум 8, при входе минимум 1.
9. **Коды.** 400 — неверные данные; 401 — нет действительной аутентификации; 403 — роль не разрешает действие; 413 — тело слишком большое; 429 — превышен лимит.
10. **npm audit** сравнивает дерево зависимостей с известными advisory. Не доказывает отсутствие всех уязвимостей и не тестирует бизнес-логику. --omit=dev выделяет production-зависимости.
11. **Утечка секрета.** Сначала отозвать/заменить секрет у провайдера, проверить доступы и журнал. Удаление файла новым коммитом не удаляет старые копии. Переписывание истории согласовать отдельно; секрет не публиковать в отчёте.
12. **SemVer.** 1.0.0 — первый стабильный контракт; 1.1.0 — совместимая новая функция; 2.0.0 — несовместимое изменение. Тег должен указывать на проверенный итоговый main.
13. **Rollback vs revert.** Vercel переключает опубликованный артефакт и быстро восстанавливает сайт, но не меняет Git. git revert добавляет обратный коммит, чтобы следующий deploy не вернул дефект. В этой работе подготовлен demo-коммит, production rollback не выполнялся и время не измерялось.

## Что показать преподавателю

Все команды выполнять в PowerShell. Для независимой демонстрации без VM и без production:

```powershell
Set-Location D:\agromarket-react\agromarket-server
npm ci
npm run test:security
# Включает 20 попыток (10 × 401 → 10 × 429), Retry-After,
# отрицательную цену 400, Helmet, чужой Origin и 413.
```

Полные SQL-тесты требуют отдельную agromarket_test. Можно указать абсолютный путь другого тестового env; проверка имени БД всё равно обязательна:

```powershell
Set-Location D:\agromarket-react\agromarket-server
# При необходимости: $env:TEST_ENV_FILE = 'D:\private\lab11-test.env'
npm test
npm audit
npm audit --omit=dev
Set-Location D:\agromarket-react
npm test
npm run lint
npm run build
```

Для демонстрации живого локального API сначала запустить backend (NODE_ENV=development) с локальной учебной БД и чистым счётчиком. Токен администратора получить **до** 20 неверных входов. Не использовать production для этой демонстрации.

```powershell
$api = 'http://localhost:3000/api'
Add-Type -AssemblyName System.Net.Http
$http = [System.Net.Http.HttpClient]::new()
$adminEmail = Read-Host 'Email локального администратора'
$secret = Read-Host 'Пароль локального администратора' -AsSecureString
$cred = [PSCredential]::new($adminEmail, $secret)
$json = @{ email=$adminEmail; password=$cred.GetNetworkCredential().Password } | ConvertTo-Json
$body = [System.Net.Http.StringContent]::new($json, [Text.Encoding]::UTF8, 'application/json')
$login = $http.PostAsync("$api/auth/login", $body).GetAwaiter().GetResult()
if ([int]$login.StatusCode -ne 200) { throw 'Не удалось войти локальным администратором' }
$token = ($login.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json).token
$json = $null; $cred = $null; $secret = $null

# Цена -500: ожидается 400, товар не создаётся.
$http.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $token)
$body = [System.Net.Http.StringContent]::new('{"name":"Audit item","category":"Audit","price":-500}', [Text.Encoding]::UTF8, 'application/json')
$r = $http.PostAsync("$api/products", $body).GetAwaiter().GetResult()
[int]$r.StatusCode
$r.Content.ReadAsStringAsync().GetAwaiter().GetResult()
$http.DefaultRequestHeaders.Authorization = $null
$token = $null

# Заголовки: нет X-Powered-By, есть nosniff и HSTS.
$r = $http.GetAsync("$api/health").GetAwaiter().GetResult()
$r.Headers.ToString()
# CORS: у evil.example нет Access-Control-Allow-Origin.
$http.DefaultRequestHeaders.Add('Origin', 'https://evil.example')
$r = $http.GetAsync("$api/health").GetAwaiter().GetResult()
$r.Headers.Contains('Access-Control-Allow-Origin') # False
$http.DefaultRequestHeaders.Remove('Origin') | Out-Null

# Перезапустить локальный backend перед следующим блоком для чистого лимита.
1..20 | ForEach-Object {
  $body = [System.Net.Http.StringContent]::new('{"email":"absent@example.test","password":"incorrect"}', [Text.Encoding]::UTF8, 'application/json')
  $r = $http.PostAsync("$api/auth/login", $body).GetAwaiter().GetResult()
  "Попытка $_ : $([int]$r.StatusCode)"
}
$r.Headers.ToString() # RateLimit и Retry-After
$http.Dispose()

# Теги пока не созданы; после согласованного релиза появится v1.0.0.
git -C D:\agromarket-react tag --list v1.0.0
git -C D:\agromarket-react\agromarket-server tag --list v1.0.0
```
