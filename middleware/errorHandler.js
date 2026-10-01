const PG_CLIENT_ERRORS = {
  '22P02': 'Неверный формат значения',
  '22003': 'Число выходит за допустимый диапазон',
  '22007': 'Неверный формат даты',
  '22008': 'Некорректная дата',
  '23502': 'Не заполнено обязательное поле',
  '23503': 'Связанная запись не найдена',
  '23514': 'Значение не проходит проверку в БД',
};

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (PG_CLIENT_ERRORS[err.code]) {
    return res.status(400).json({
      error: PG_CLIENT_ERRORS[err.code],
      detail: err.message,
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Некорректный JSON',
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Слишком большое тело запроса',
    });
  }

  console.error(err);

  res.status(500).json({
    error: 'Внутренняя ошибка сервера',
  });
}