export function undatedCostBlocksAutomation(): boolean {
  const flag = process.env.PRICE_UNDATED_REQUIRES_CONFIRMATION;
  return flag == null || flag === "" || (flag !== "false" && flag !== "0");
}
