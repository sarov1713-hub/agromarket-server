import { z } from 'zod';

const text = (min, max) => z.string({ error: 'Ожидается строка' }).trim()
  .min(min, `Минимум ${min} символов`).max(max, `Максимум ${max} символов`);
const email = text(1, 254).pipe(z.email({ error: 'Некорректный e-mail' })).transform((s) => s.toLowerCase());
const password = (min) => z.string({ error: 'Укажите пароль' })
  .min(min, `Пароль: минимум ${min} символов`).max(72, 'Пароль: максимум 72 символа')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Пароль: максимум 72 байта UTF-8');

// z.object удаляет неизвестные поля, в том числе role. INSERT не принимает role.
export const registerSchema = z.object({ name: text(2, 100), email, password: password(8) });
export const loginSchema = z.object({ email, password: password(1) });

const price = z.union([z.number(), z.string().trim().min(1, 'Укажите цену')])
  .pipe(z.coerce.number().int('Цена должна быть целым числом')
    .positive('Цена должна быть больше нуля').max(10_000_000, 'Цена не более 10 000 000'));
const image = z.string().trim().max(2048).refine((value) => {
  if (value === '' || (value.startsWith('/') && !value.startsWith('//'))) return true;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}, 'Изображение: HTTP(S) URL или относительный путь /...').nullable();
const productFields = {
  name: text(2, 200), price, category: text(1, 50),
  unit: text(1, 20), image,
};
export const productSchema = z.object({ ...productFields, unit: productFields.unit.default('кг'), image: image.optional() });
export const productUpdateSchema = z.object(productFields).partial()
  .refine((data) => Object.keys(data).length > 0, 'Укажите хотя бы одно поле товара');
