import { app } from './app.js';

const port = Number(process.env.PORT || 8789);

app.listen(port, '127.0.0.1', () => {
  console.log(`Iztro Agents ChatSession demo backend: http://127.0.0.1:${port}`);
});
