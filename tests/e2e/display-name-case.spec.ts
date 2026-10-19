import { test, expect } from "playwright/test";
import { formatPersonDisplayName, getProfessionalDisplayName } from "../../src/lib/display-name";

for (const [official, displayed] of [
  ["ISAAC ALBERTO SANCHEZ MONGE", "Isaac Sanchez Monge"],
  ["ISAAC SANCHEZ MONGE", "Isaac Sanchez Monge"],
  ["MARÍA JOSÉ DE LA CRUZ", "María José de la Cruz"],
  ["JUAN PABLO PÉREZ GÓMEZ", "Juan Pablo Pérez Gómez"],
  ["ANA DEL CARMEN O'NEILL", "Ana del Carmen O'Neill"],
  ["ELENA PÉREZ-GÓMEZ", "Elena Pérez-Gómez"],
  ["  ISAAC   SANCHEZ MONGE  ", "Isaac Sanchez Monge"],
  ["Ian McDonald O'Neill", "Ian McDonald O'Neill"],
  ["João da Silva", "João da Silva"],
]) {
  test("personal name presentation: " + official, () => {
    expect(formatPersonDisplayName(official)).toBe(displayed);
  });
}
for (const business of ["SG SOLUTIONS", "iPhone CR", "AB Servicios y Soluciones", "TALLER EL BUEN CAMINO"]) {
  test("commercial name retains its spelling: " + business, () => {
    expect(getProfessionalDisplayName("ISAAC ALBERTO SANCHEZ MONGE", business).primaryDesktop).toBe(business);
    expect(getProfessionalDisplayName("ISAAC ALBERTO SANCHEZ MONGE", business).primaryMobile).toBe(business);
  });
}
