export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export type HealthResponse = {
  status: 'ok';
  db: 'ok';
  /** 서버 기준(Asia/Seoul) 오늘 날짜, YYYY-MM-DD */
  today: string;
};
