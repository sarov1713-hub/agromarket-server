import { readFileSync } from 'node:fs';

const db = JSON.parse(readFileSync('./data/db.json', 'utf-8'));

export const products = db.products;