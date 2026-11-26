import { expect, test } from "playwright/test";
import { formatJobSalary } from "../../src/lib/jobs";

const base = { salary_period: "monthly" as const, currency: "CRC" as const, show_salary: true };

test.describe("@contract salario de un empleo", () => {
  test("dos montos iguales son un salario fijo, sin Desde ni Hasta", () => {
    expect(formatJobSalary({ ...base, salary_min: 500000, salary_max: 500000 })).toBe("₡500.000 por mes");
  });

  test("un solo monto es Desde o Hasta", () => {
    expect(formatJobSalary({ ...base, salary_min: 500000, salary_max: null })).toBe("Desde ₡500.000 por mes");
    expect(formatJobSalary({ ...base, salary_min: null, salary_max: 500000 })).toBe("Hasta ₡500.000 por mes");
  });

  test("dos montos distintos siguen siendo un rango", () => {
    expect(formatJobSalary({ ...base, salary_min: 450000, salary_max: 650000 })).toBe("₡450.000 - ₡650.000 por mes");
  });

  test("sin monto o con salario oculto dice a convenir", () => {
    expect(formatJobSalary({ ...base, salary_min: null, salary_max: null })).toBe("Salario a convenir");
    expect(formatJobSalary({ ...base, salary_min: 500000, salary_max: null, show_salary: false })).toBe("Salario a convenir");
  });

  test("en inglés se mantienen las cuatro formas", () => {
    expect(formatJobSalary({ ...base, currency: "USD" as const, salary_min: 1200, salary_max: 1200 }, "en")).toBe("$1,200 per month");
    expect(formatJobSalary({ ...base, currency: "USD" as const, salary_min: 1200, salary_max: null }, "en")).toBe("From $1,200 per month");
  });
});
