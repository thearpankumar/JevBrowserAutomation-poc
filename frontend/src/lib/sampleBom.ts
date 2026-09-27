const SAMPLE_BOM_CSV = `MPN,Package,Qty
STM32F407VGT6,LQFP100,25
LM358,SOIC8,100
ATmega328P,TQFP32,50
RC0805FR-071KL,0805,500
`;

export function downloadSampleBomCsv(): void {
  const blob = new Blob([SAMPLE_BOM_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sample-bom.csv";
  a.click();
  URL.revokeObjectURL(url);
}
