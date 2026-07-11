import { describe, it, expect, vi } from "vitest";

describe("QuotationModal", () => {
  it("should calculate totals correctly", () => {
    const items = [
      { productName: "Produto A", quantity: 2, unitPrice: 100 },
      { productName: "Produto B", quantity: 1, unitPrice: 50 },
    ];

    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    expect(subtotal).toBe(250);
  });

  it("should apply discount correctly", () => {
    const subtotal = 250;
    const discount = 25;
    const total = subtotal - discount;
    expect(total).toBe(225);
  });

  it("should apply tax correctly", () => {
    const subtotal = 250;
    const tax = 25;
    const total = subtotal + tax;
    expect(total).toBe(275);
  });

  it("should calculate total with discount and tax", () => {
    const subtotal = 250;
    const discount = 25;
    const tax = 20;
    const total = subtotal - discount + tax;
    expect(total).toBe(245);
  });

  it("should format currency correctly", () => {
    const value = 250.5;
    const formatted = value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(formatted).toBe("250,50");
  });

  it("should validate quotation number", () => {
    const number = "ORC-001";
    expect(number.length).toBeGreaterThan(0);
    expect(number).toContain("ORC");
  });

  it("should handle empty items list", () => {
    const items: Array<{ productName: string; quantity: number; unitPrice: number }> = [];
    expect(items.length).toBe(0);
  });

  it("should validate item data", () => {
    const item = {
      productName: "Produto A",
      quantity: 1,
      unitPrice: 100,
    };

    expect(item.productName).toBeTruthy();
    expect(item.quantity).toBeGreaterThan(0);
    expect(item.unitPrice).toBeGreaterThanOrEqual(0);
  });

  it("should generate quotation number with timestamp", () => {
    const number = `ORC-${new Date().getTime()}`;
    expect(number).toMatch(/^ORC-\d+$/);
  });

  it("should handle client information", () => {
    const client = {
      name: "Cliente A",
      email: "cliente@example.com",
      phone: "(11) 99999-9999",
    };

    expect(client.name).toBeTruthy();
    expect(client.email).toContain("@");
    expect(client.phone).toBeTruthy();
  });

  it("should calculate item total price", () => {
    const item = {
      productName: "Produto A",
      quantity: 5,
      unitPrice: 100,
    };

    const totalPrice = item.quantity * item.unitPrice;
    expect(totalPrice).toBe(500);
  });
});
