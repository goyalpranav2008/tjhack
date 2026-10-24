/**
 * Illustrative sample data for the demo console and fan pages.
 * Cities, languages, formats and price bands come from lib/formats.js
 * so there is one source of truth across the whole frontend.
 *
 * optins   = qualified fan opt-ins collected in the test
 * price    = price band the fans tested best
 * maxPrice = the most fans said they would pay
 * setup    = one-time fixed setup cost
 */
import { CITIES, LANGUAGES, FORMAT_LABELS, PRICE_BANDS } from "../lib/formats"

export { CITIES, LANGUAGES, PRICE_BANDS }
export const FORMATS = FORMAT_LABELS

export const CONCEPT = "Skyblade Chronicles (sample title)"

export const COMBOS = [
  { id: 1,  city: "Delhi NCR",  language: "Hindi",           format: "Merch",        optins: 520, price: 799, production: 360, logistics: 85, maxPrice: 999,  setup: 30000 },
  { id: 2,  city: "Bengaluru",  language: "English",         format: "Merch",        optins: 410, price: 899, production: 360, logistics: 85, maxPrice: 1099, setup: 30000 },
  { id: 3,  city: "Chennai",    language: "Tamil",           format: "Digital manga", optins: 620, price: 149, production: 20,  logistics: 0,  maxPrice: 199,  setup: 8000  },
  { id: 4,  city: "Mumbai",     language: "Hindi",           format: "Event ticket", optins: 390, price: 599, production: 220, logistics: 30, maxPrice: 749,  setup: 20000 },
  { id: 5,  city: "Pune",       language: "Hindi",           format: "Event ticket", optins: 280, price: 499, production: 200, logistics: 30, maxPrice: 649,  setup: 20000 },
  { id: 6,  city: "Chennai",    language: "Tamil",           format: "Merch",        optins: 210, price: 699, production: 360, logistics: 85, maxPrice: 799,  setup: 30000 },
  { id: 7,  city: "Hyderabad",  language: "Telugu",          format: "Digital manga", optins: 190, price: 149, production: 20,  logistics: 0,  maxPrice: 179,  setup: 8000  },
  { id: 8,  city: "Delhi NCR",  language: "English",         format: "Digital manga", optins: 340, price: 99,  production: 15,  logistics: 0,  maxPrice: 149,  setup: 8000  },
  { id: 9,  city: "Kolkata",    language: "Bengali",         format: "Merch",        optins: 120, price: 799, production: 360, logistics: 85, maxPrice: 899,  setup: 30000 },
  { id: 10, city: "Jaipur",     language: "Hindi",           format: "Merch",        optins: 70,  price: 749, production: 360, logistics: 85, maxPrice: 749,  setup: 30000 },
]
