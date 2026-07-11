import { describe, it, expect } from "vitest";
import {
  parseNfeXml,
  validateNfeData,
  extractProductSummary,
  formatNfeForDisplay,
} from "./nfeParserService";

// Sample minimal NFe XML for testing
const sampleNfeXml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe>
    <infNFe versao="4.00" Id="NFe12345678901234567890123456789012345678901234">
      <ide>
        <cUF>35</cUF>
        <cNF>12345678</cNF>
        <dNF>20240101</dNF>
        <dEmi>2024-01-01</dEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>3550308</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>1</cDV>
        <tpAmb>2</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>0</indFinal>
        <indPres>0</indPres>
        <procEmi>0</procEmi>
        <verProc>4.0</verProc>
      </ide>
      <emit>
        <CNPJ>12345678901234</CNPJ>
        <xNome>Fornecedor Teste LTDA</xNome>
        <xFant>Fornecedor Teste</xFant>
        <enderEmit>
          <xLgr>Rua Teste</xLgr>
          <nro>123</nro>
          <xCpl>Apto 1</xCpl>
          <xBairro>Bairro Teste</xBairro>
          <cMun>3550308</cMun>
          <xMun>São Paulo</xMun>
          <UF>SP</UF>
          <CEP>01310100</CEP>
          <cPais>1058</cPais>
          <xPais>Brasil</xPais>
        </enderEmit>
        <IE>123456789012345</IE>
        <IEST></IEST>
        <IM></IM>
        <CNAE>2062100</CNAE>
        <CRT>1</CRT>
      </emit>
      <dest>
        <CNPJ>98765432109876</CNPJ>
        <xNome>Cliente Teste LTDA</xNome>
        <enderDest>
          <xLgr>Avenida Teste</xLgr>
          <nro>456</nro>
          <xBairro>Bairro Cliente</xBairro>
          <cMun>3550308</cMun>
          <xMun>São Paulo</xMun>
          <UF>SP</UF>
          <CEP>01310200</CEP>
          <cPais>1058</cPais>
          <xPais>Brasil</xPais>
        </enderDest>
        <IE>987654321098765</IE>
        <email>cliente@teste.com.br</email>
      </dest>
      <det nItem="1">
        <prod>
          <code>123456</code>
          <cEAN>1234567890123</cEAN>
          <xProd>Amoxicilina 500mg Cápsula</xProd>
          <NCM>30049090</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>100</qCom>
          <vUnCom>15.50</vUnCom>
          <vItem>1550.00</vItem>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <modBC>0</modBC>
              <vBC>1550.00</vBC>
              <pICMS>7</pICMS>
              <vICMS>108.50</vICMS>
            </ICMS00>
          </ICMS>
          <IPI>
            <IPITrib>
              <CST>50</CST>
              <vBC>0</vBC>
              <pIPI>0</pIPI>
              <vIPI>0</vIPI>
            </IPITrib>
          </IPI>
          <PIS>
            <PISAliq>
              <CST>01</CST>
              <vBC>1550.00</vBC>
              <pPIS>1.65</pPIS>
              <vPIS>25.58</vPIS>
            </PISAliq>
          </PIS>
          <COFINS>
            <COFINSAliq>
              <CST>01</CST>
              <vBC>1550.00</vBC>
              <pCOFINS>7.6</pCOFINS>
              <vCOFINS>117.80</vCOFINS>
            </COFINSAliq>
          </COFINS>
        </imposto>
      </det>
      <det nItem="2">
        <prod>
          <code>789012</code>
          <cEAN>9876543210987</cEAN>
          <xProd>Dipirona 500mg Comprimido</xProd>
          <NCM>30049090</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>200</qCom>
          <vUnCom>5.25</vUnCom>
          <vItem>1050.00</vItem>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <modBC>0</modBC>
              <vBC>1050.00</vBC>
              <pICMS>7</pICMS>
              <vICMS>73.50</vICMS>
            </ICMS00>
          </ICMS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vBC>2600.00</vBC>
          <vICMS>182.00</vICMS>
          <vICMSDeson>0</vICMSDeson>
          <vFCPUESTDeson>0</vFCPUESTDeson>
          <vST>0</vST>
          <vProd>2600.00</vProd>
          <vFrete>0</vFrete>
          <vSeg>0</vSeg>
          <vDesc>0</vDesc>
          <vII>0</vII>
          <vIPI>0</vIPI>
          <vIPIDevol>0</vIPIDevol>
          <vPIS>25.58</vPIS>
          <vCOFINS>117.80</vCOFINS>
          <vOutro>0</vOutro>
          <vNF>2600.00</vNF>
        </ICMSTot>
      </total>
      <transp>
        <modFrete>0</modFrete>
      </transp>
      <cobr>
        <fat>
          <nFat>001</nFat>
          <vOrig>2600.00</vOrig>
          <vDesc>0</vDesc>
          <vLiq>2600.00</vLiq>
        </fat>
        <dup>
          <nDup>001</nDup>
          <dVenc>2024-02-01</dVenc>
          <vDup>2600.00</vDup>
        </dup>
      </cobr>
      <pag>
        <detPag>
          <tPag>01</tPag>
          <vPag>2600.00</vPag>
          <card>
            <CNPJ>16716114000172</CNPJ>
            <tBand>01</tBand>
            <cAut>123456</cAut>
          </card>
        </detPag>
      </pag>
      <infIntermed>
        <CNPJ>12345678901234</CNPJ>
        <idCad>123456</idCad>
        <xNome>Intermediário</xNome>
      </infIntermed>
      <exporta>
        <UFSaidaPais>SP</UFSaidaPais>
      </exporta>
      <compra>
        <xNEmp>12345678</xNEmp>
        <parcelExp>1</parcelExp>
        <CNPJ>12345678901234</CNPJ>
      </compra>
      <cana>
        <safra>2024</safra>
        <ref>01/2024</ref>
      </cana>
      <infRespTec>
        <IDNR>12345678901234567890123456789012</IDNR>
        <hashRespTec>1234567890123456789012345678901234567890123</hashRespTec>
        <dhAssinRespTec>2024-01-01T10:00:00</dhAssinRespTec>
      </infRespTec>
    </infNFe>
  </NFe>
</nfeProc>`;

describe("nfeParserService", () => {
  describe("parseNfeXml", () => {
    it("should parse valid NFe XML", async () => {
      const result = await parseNfeXml(sampleNfeXml);

      expect(result).toBeDefined();
      expect(result.nfeNumber).toBe("12345678");
      expect(result.supplierName).toBe("Fornecedor Teste LTDA");
      expect(result.supplierCnpj).toBe("12345678901234");
      expect(result.products.length).toBe(2);
      expect(result.totalValue).toBe(2600);
    });

    it("should extract product details correctly", async () => {
      const result = await parseNfeXml(sampleNfeXml);
      const firstProduct = result.products[0];

      expect(firstProduct.productName).toBe("Amoxicilina 500mg Cápsula");
      expect(firstProduct.ean).toBe("1234567890123");
      expect(firstProduct.quantity).toBe(100);
      expect(firstProduct.unitPrice).toBe(15.5);
      expect(firstProduct.totalPrice).toBe(1550);
      expect(firstProduct.unit).toBe("UN");
    });

    it("should sanitize BOM and stray text before the first XML tag", async () => {
      const dirtyXml = `\uFEFFPedido exportado\n${sampleNfeXml}`;
      const result = await parseNfeXml(dirtyXml);

      expect(result.nfeNumber).toBe("12345678");
      expect(result.products.length).toBe(2);
    });

    it("should prioritize nNF when it exists in the XML", async () => {
      const xmlWithRealNumber = sampleNfeXml.replace("<cNF>12345678</cNF>", "<cNF>87654321</cNF><nNF>998877</nNF>");
      const result = await parseNfeXml(xmlWithRealNumber);

      expect(result.nfeNumber).toBe("998877");
    });

    it("should throw error on invalid XML", async () => {
      const invalidXml = "<invalid>xml</invalid>";

      try {
        await parseNfeXml(invalidXml);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("validateNfeData", () => {
    it("should validate correct NFe data", async () => {
      const nfeData = await parseNfeXml(sampleNfeXml);
      const validation = validateNfeData(nfeData);

      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it("should detect missing supplier name", () => {
      const invalidData = {
        nfeNumber: "12345678",
        nfeDate: "2024-01-01",
        supplierName: "DESCONHECIDO",
        supplierCnpj: "12345678901234",
        products: [
          {
            id: "1",
            productName: "Produto",
            quantity: 1,
            unitPrice: 10,
            totalPrice: 10,
          },
        ],
        totalValue: 10,
      };

      const validation = validateNfeData(invalidData);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes("fornecedor"))).toBe(true);
    });

    it("should detect empty products", () => {
      const invalidData = {
        nfeNumber: "12345678",
        nfeDate: "2024-01-01",
        supplierName: "Fornecedor",
        supplierCnpj: "12345678901234",
        products: [],
        totalValue: 0,
      };

      const validation = validateNfeData(invalidData);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes("Nenhum produto"))).toBe(true);
    });
  });

  describe("extractProductSummary", () => {
    it("should calculate correct summary", async () => {
      const nfeData = await parseNfeXml(sampleNfeXml);
      const summary = extractProductSummary(nfeData);

      expect(summary.totalProducts).toBe(2);
      expect(summary.totalQuantity).toBe(300); // 100 + 200
      expect(summary.priceRange.min).toBe(5.25);
      expect(summary.priceRange.max).toBe(15.5);
    });
  });

  describe("formatNfeForDisplay", () => {
    it("should format NFe data for display", async () => {
      const nfeData = await parseNfeXml(sampleNfeXml);
      const formatted = formatNfeForDisplay(nfeData);

      expect(formatted.nfeInfo).toContain("12345678");
      expect(formatted.supplierInfo).toContain("Fornecedor Teste LTDA");
      expect(formatted.productCount).toContain("2 produto(s)");
    });
  });
});
