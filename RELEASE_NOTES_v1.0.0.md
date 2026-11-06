# АгроМаркет 1.0 — проект release notes

Статус: подготовлено, **релиз не опубликован**, тег не создан. Используется фактический backend-репозиторий agromarket-server.

- Каталог фермерских товаров, поиск, изображения и оптовые заявки.
- Регистрация/вход, JWT, роли user/admin, защищённое управление товарами.
- Helmet, allowlist CORS, общий лимит login/register 10 запросов за 15 минут.
- Zod: нормализация email, ограничения полей и bcrypt-паролей, защита от mass assignment, безопасный PATCH.
- Положительные INTEGER ID и JSON до 100 KB.
- Исправлены 3 уязвимые транзитивные зависимости; backend npm audit: 0.
- 82 backend-теста на временной PostgreSQL, 23 frontend-теста, lint/build успешны.
- Формы показывают server details и сообщение 429.

## Условия публикации

1. Review напарника, зелёные GitHub CI, merge backend security/hardening и docs/lab11, frontend security/server-errors.
2. Подтвердить deploy Render/Vercel и новые проверки на опубликованной версии.
3. Получить явное разрешение владельца на публикацию релиза.
4. Только затем выполнить для обоих репозиториев (если тег ещё не существует):

```powershell
Set-Location D:\agromarket-react\agromarket-server
git switch main
git pull --ff-only
git tag -a v1.0.0 -m "АгроМаркет 1.0: каталог, заявки, JWT, тесты, защита API"
git push origin v1.0.0
gh release create v1.0.0 --verify-tag --title 'АгроМаркет 1.0' --notes-file RELEASE_NOTES_v1.0.0.md

Set-Location D:\agromarket-react
git switch main
git pull --ff-only
git tag -a v1.0.0 -m "АгроМаркет 1.0: каталог, заявки, JWT, тесты, защита API"
git push origin v1.0.0
gh release create v1.0.0 --verify-tag --title 'АгроМаркет 1.0' --notes-file agromarket-server/RELEASE_NOTES_v1.0.0.md
```

Не перемещать существующий тег и не создавать его до выполнения условий. gh должен быть авторизован.

## Безопасно подготовленная демонстрация rollback

Frontend branch: demo/rollback-lab11, коммит 26bc0b8. Меняет только hero-заголовок на «СЛОМАНО», создан от исходного main; в рабочей ветке security/server-errors и текущем main дефекта нет.

До согласования допускается только draft PR/preview. **Не выполнять merge и не менять production без явного разрешения.**

После разрешения: проверить CI и доступ к предыдущему рабочему deploy Vercel → merge demo PR → дождаться deploy → убедиться в видимом изменении. Запустить секундомер непосредственно перед Instant Rollback/Promote рабочего deploy, остановить после подтверждения восстановления заголовка и каталога. Записать фактическое время и идентификаторы обоих deploy. Сейчас результат: **Не проверено — нет разрешения на production-эксперимент и авторизованного доступа к Vercel**.

Затем от актуального main создать fix/revert-lab11-demo, выполнить git revert 26bc0b8 (при squash использовать SHA фактического squash-коммита), commit/PR → CI/review → merge. Проверить отсутствие «СЛОМАНО» в main и новом deploy. Revert заранее не исполнялся: исходный demo-коммит ещё не включён в main.
