/**
 * equivalenciaPdf.ts
 * Geração do Relatório Formal de Equivalência Técnica para Licitações
 * Utiliza PDFKit para gerar um documento A4 estruturado com:
 *  - Cabeçalho institucional
 *  - Produto de referência com ficha técnica
 *  - Tabela comparativa de candidatos com score, status e divergências
 *  - Assinatura e rodapé
 */
import PDFDocument from "pdfkit";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface EquivalenciaReportData {
  session: {
    id: number;
    title: string;
    processNumber: string | null;
    orgName: string | null;
    editalItem: string | null;
    notes: string | null;
    createdAt: Date;
    createdBy: string;
  };
  referenceProduct: {
    id: number;
    name: string;
    manufacturer: string | null;
    concentration: string | null;
    presentation: string | null;
    pharmaceuticalForm: string | null;
    activeIngredient: string | null;
    mapa: string | null;
    fichaTecnica: string | null;
  };
  results: Array<{
    id: number;
    candidateProduct: {
      id: number;
      name: string;
      manufacturer: string | null;
      concentration: string | null;
      presentation: string | null;
      activeIngredient: string | null;
      mapa: string | null;
      price: string | null;
    };
    score: string | null;
    status: "APROVADO" | "REPROVADO" | "REVISAO" | null;
    divergences: string | null;
    reviewNotes: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
  }>;
  company: {
    name: string;
    cnpj: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

// ─── Cores ────────────────────────────────────────────────────────────────────
const BLUE = "#1A3F8F";
const DARK = "#111827";
const GRAY = "#6B7280";
const LIGHT = "#F3F4F6";
const BORDER = "#E5E7EB";
const WHITE = "#FFFFFF";
const GREEN = "#16a34a";
const RED = "#dc2626";
const AMBER = "#d97706";

// ─── Gerador Principal ────────────────────────────────────────────────────────
export async function generateEquivalenciaPdf(data: EquivalenciaReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 70, left: 50, right: 50 },
      info: {
        Title: `Relatório de Equivalência Técnica — ${data.session.title}`,
        Author: data.company?.name ?? "S2 Corporativo",
        Subject: "Equivalência Técnica para Licitação",
        Keywords: "equivalência técnica, licitação, pregão, produto similar",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 100;

    // ── Rodapé ───────────────────────────────────────────────────────────────
    function drawFooter() {
      const footerY = doc.page.height - 55;
      doc.rect(0, footerY, doc.page.width, 55).fill(BLUE);
      const company = data.company;
      const companyName = company?.name ?? "S2 Corporativo";
      const cnpj = company?.cnpj ? `CNPJ ${company.cnpj}` : "";
      const addr = [company?.address, company?.city, company?.state].filter(Boolean).join(", ");
      doc.font("Helvetica-Bold").fontSize(7).fillColor(WHITE).text(companyName, 50, footerY + 8, { width: pageWidth / 2 });
      if (cnpj) doc.font("Helvetica").fontSize(6.5).fillColor("#BFD0F0").text(cnpj, 50, footerY + 18, { width: pageWidth / 2 });
      if (addr) doc.font("Helvetica").fontSize(6.5).fillColor("#BFD0F0").text(addr, 50, footerY + 28, { width: pageWidth / 2 });
      // Página
      doc.font("Helvetica").fontSize(6.5).fillColor("#BFD0F0")
        .text(`Gerado em ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`, 50 + pageWidth / 2 + 10, footerY + 8, { width: pageWidth / 2 - 10, align: "right" });
      doc.font("Helvetica").fontSize(6.5).fillColor("#BFD0F0")
        .text("Relatório de Equivalência Técnica — Uso exclusivo para fins licitatórios", 50 + pageWidth / 2 + 10, footerY + 18, { width: pageWidth / 2 - 10, align: "right" });
    }

    // ── Cabeçalho ─────────────────────────────────────────────────────────────
    // Barra azul superior
    doc.rect(0, 0, doc.page.width, 8).fill(BLUE);

    // Título do documento
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(16).fillColor(BLUE)
      .text("RELATÓRIO DE EQUIVALÊNCIA TÉCNICA", 50, 30, { width: pageWidth, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor(GRAY)
      .text("Documento para fins licitatórios — Art. 7º, §1º, Lei 14.133/2021", 50, 52, { width: pageWidth, align: "center" });

    // Linha divisória
    doc.moveTo(50, 70).lineTo(50 + pageWidth, 70).strokeColor(BORDER).lineWidth(1).stroke();

    // ── Dados do Processo ─────────────────────────────────────────────────────
    let y = 82;
    doc.rect(50, y, pageWidth, 18).fill(BLUE);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE)
      .text("DADOS DO PROCESSO / SESSÃO DE COMPARAÇÃO", 55, y + 5, { width: pageWidth - 10 });
    y += 22;

    const sessionFields = [
      { label: "Título da Sessão", value: data.session.title },
      { label: "Nº do Processo / Edital", value: data.session.processNumber ?? "—" },
      { label: "Órgão Licitante", value: data.session.orgName ?? "—" },
      { label: "Item do Edital", value: data.session.editalItem ?? "—" },
      { label: "Responsável pela Análise", value: data.session.createdBy },
      { label: "Data da Análise", value: new Date(data.session.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) },
    ];

    const colW = pageWidth / 2 - 5;
    let col = 0;
    let rowY = y;
    for (const f of sessionFields) {
      const x = 50 + col * (colW + 10);
      doc.rect(x, rowY, colW, 28).fill(LIGHT).stroke(BORDER);
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(GRAY).text(f.label.toUpperCase(), x + 5, rowY + 4, { width: colW - 10 });
      doc.font("Helvetica").fontSize(8).fillColor(DARK).text(f.value, x + 5, rowY + 14, { width: colW - 10 });
      col++;
      if (col === 2) { col = 0; rowY += 32; }
    }
    if (col === 1) rowY += 32;
    y = rowY + 8;

    if (data.session.notes) {
      doc.rect(50, y, pageWidth, 14).fill(LIGHT).stroke(BORDER);
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(GRAY).text("OBSERVAÇÕES", 55, y + 4, { width: pageWidth - 10 });
      y += 14;
      doc.rect(50, y, pageWidth, 24).fill(WHITE).stroke(BORDER);
      doc.font("Helvetica").fontSize(8).fillColor(DARK).text(data.session.notes, 55, y + 6, { width: pageWidth - 10 });
      y += 28;
    }

    y += 10;

    // ── Produto de Referência ─────────────────────────────────────────────────
    doc.rect(50, y, pageWidth, 18).fill(BLUE);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE)
      .text("PRODUTO DE REFERÊNCIA (ITEM DO EDITAL)", 55, y + 5, { width: pageWidth - 10 });
    y += 22;

    const ref = data.referenceProduct;
    const refFields = [
      { label: "Denominação / Nome", value: ref.name },
      { label: "Fabricante / Laboratório", value: ref.manufacturer ?? "—" },
      { label: "Princípio Ativo / Composição", value: ref.activeIngredient ?? "—" },
      { label: "Concentração", value: ref.concentration ?? "—" },
      { label: "Forma Farmacêutica / Apresentação", value: [ref.pharmaceuticalForm, ref.presentation].filter(Boolean).join(" — ") || "—" },
      { label: "Registro MAPA / ANVISA", value: ref.mapa ?? "—" },
    ];

    col = 0;
    rowY = y;
    for (const f of refFields) {
      const x = 50 + col * (colW + 10);
      doc.rect(x, rowY, colW, 28).fill(LIGHT).stroke(BORDER);
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(GRAY).text(f.label.toUpperCase(), x + 5, rowY + 4, { width: colW - 10 });
      doc.font("Helvetica").fontSize(8).fillColor(DARK).text(f.value, x + 5, rowY + 14, { width: colW - 10 });
      col++;
      if (col === 2) { col = 0; rowY += 32; }
    }
    if (col === 1) rowY += 32;
    y = rowY + 8;

    // Ficha técnica do produto de referência
    if (ref.fichaTecnica) {
      let ftParsed: Record<string, string> | null = null;
      try { ftParsed = JSON.parse(ref.fichaTecnica); } catch {}
      if (ftParsed && typeof ftParsed === "object") {
        const ftFields = [
          { key: "principioAtivo", label: "Princípio Ativo" },
          { key: "concentracao", label: "Concentração" },
          { key: "formaFarmaceutica", label: "Forma Farmacêutica" },
          { key: "classeTerapeutica", label: "Classe Terapêutica" },
          { key: "especieAlvo", label: "Espécie-Alvo" },
          { key: "indicacoes", label: "Indicações" },
          { key: "viaAdministracao", label: "Via de Administração" },
          { key: "posologia", label: "Posologia" },
        ].filter((f) => ftParsed![f.key]);
        if (ftFields.length > 0) {
          doc.rect(50, y, pageWidth, 14).fill("#EDE9FE").stroke("#C4B5FD");
          doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#5B21B6").text("FICHA TÉCNICA ESTRUTURADA (PRODUTO DE REFERÊNCIA)", 55, y + 4, { width: pageWidth - 10 });
          y += 14;
          const ftColW = (pageWidth - 10) / 3;
          col = 0;
          rowY = y;
          for (const f of ftFields) {
            const x = 50 + col * (ftColW + 5);
            doc.rect(x, rowY, ftColW, 26).fill(WHITE).stroke("#DDD6FE");
            doc.font("Helvetica-Bold").fontSize(6).fillColor("#7C3AED").text(f.label.toUpperCase(), x + 4, rowY + 3, { width: ftColW - 8 });
            doc.font("Helvetica").fontSize(7.5).fillColor(DARK).text(ftParsed![f.key], x + 4, rowY + 12, { width: ftColW - 8 });
            col++;
            if (col === 3) { col = 0; rowY += 30; }
          }
          if (col > 0) rowY += 30;
          y = rowY + 8;
        }
      }
    }

    y += 10;

    // ── Tabela de Candidatos ──────────────────────────────────────────────────
    if (doc.y > doc.page.height - 200) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, 8).fill(BLUE);
      y = 30;
    }

    doc.rect(50, y, pageWidth, 18).fill(BLUE);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE)
      .text(`ANÁLISE COMPARATIVA — ${data.results.length} CANDIDATO(S) AVALIADO(S)`, 55, y + 5, { width: pageWidth - 10 });
    y += 22;

    // Cabeçalho da tabela
    const colWidths = [
      Math.round(pageWidth * 0.30), // Produto Candidato
      Math.round(pageWidth * 0.16), // Fabricante
      Math.round(pageWidth * 0.10), // Concentração
      Math.round(pageWidth * 0.08), // Score
      Math.round(pageWidth * 0.10), // Status
      Math.round(pageWidth * 0.10), // Preço
      Math.round(pageWidth * 0.16), // Divergências
    ];
    const colHeaders = ["Produto Candidato", "Fabricante", "Concentração", "Score", "Status", "Preço", "Divergências"];
    let cx = 50;
    for (let i = 0; i < colHeaders.length; i++) {
      doc.rect(cx, y, colWidths[i], 16).fill(DARK).stroke(BORDER);
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(WHITE)
        .text(colHeaders[i].toUpperCase(), cx + 3, y + 5, { width: colWidths[i] - 6, align: "center" });
      cx += colWidths[i];
    }
    y += 16;

    // Linhas da tabela
    for (let ri = 0; ri < data.results.length; ri++) {
      const r = data.results[ri];
      const cand = r.candidateProduct;
      const score = r.score ? `${Math.round(Number(r.score) * 100)}%` : "—";
      const status = r.status ?? "REVISAO";
      const statusColor = status === "APROVADO" ? GREEN : status === "REPROVADO" ? RED : AMBER;
      const statusLabel = status === "APROVADO" ? "APROVADO" : status === "REPROVADO" ? "REPROVADO" : "REVISÃO";
      const price = cand.price ? `R$ ${parseFloat(cand.price).toFixed(2)}` : "—";

      let divergences = "—";
      if (r.divergences) {
        try {
          const divArr = JSON.parse(r.divergences) as Array<{ attribute: string; reason: string }>;
          divergences = divArr.slice(0, 3).map((d) => `${d.attribute}: ${d.reason}`).join("; ");
        } catch {
          divergences = r.divergences.substring(0, 80);
        }
      }

      // Calcular altura da linha (baseado no conteúdo mais longo)
      const rowHeight = 32;

      // Verificar se precisa de nova página
      if (y + rowHeight > doc.page.height - 80) {
        drawFooter();
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 8).fill(BLUE);
        y = 30;
        // Repetir cabeçalho
        cx = 50;
        for (let i = 0; i < colHeaders.length; i++) {
          doc.rect(cx, y, colWidths[i], 16).fill(DARK).stroke(BORDER);
          doc.font("Helvetica-Bold").fontSize(6.5).fillColor(WHITE)
            .text(colHeaders[i].toUpperCase(), cx + 3, y + 5, { width: colWidths[i] - 6, align: "center" });
          cx += colWidths[i];
        }
        y += 16;
      }

      const rowBg = ri % 2 === 0 ? WHITE : LIGHT;
      const cellValues = [
        cand.name,
        cand.manufacturer ?? "—",
        cand.concentration ?? "—",
        score,
        statusLabel,
        price,
        divergences,
      ];

      cx = 50;
      for (let ci = 0; ci < cellValues.length; ci++) {
        doc.rect(cx, y, colWidths[ci], rowHeight).fill(ci === 4 ? `${statusColor}15` : rowBg).stroke(BORDER);
        const textColor = ci === 4 ? statusColor : ci === 3 ? (Number(r.score ?? 0) >= 0.8 ? GREEN : Number(r.score ?? 0) >= 0.6 ? AMBER : RED) : DARK;
        const isBold = ci === 4 || ci === 3;
        doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(7).fillColor(textColor)
          .text(cellValues[ci], cx + 3, y + 4, { width: colWidths[ci] - 6, height: rowHeight - 8, ellipsis: true });
        cx += colWidths[ci];
      }
      y += rowHeight;

      // Notas de revisão
      if (r.reviewNotes) {
        const noteHeight = 18;
        if (y + noteHeight > doc.page.height - 80) {
          drawFooter();
          doc.addPage();
          doc.rect(0, 0, doc.page.width, 8).fill(BLUE);
          y = 30;
        }
        doc.rect(50, y, pageWidth, noteHeight).fill("#FFF7ED").stroke("#FED7AA");
        doc.font("Helvetica-Bold").fontSize(6).fillColor(AMBER).text("NOTA DO REVISOR:", 55, y + 4, { continued: true });
        doc.font("Helvetica").fontSize(6).fillColor(DARK).text(` ${r.reviewNotes}`, { width: pageWidth - 70 });
        if (r.reviewedBy) {
          doc.font("Helvetica").fontSize(5.5).fillColor(GRAY)
            .text(`Revisado por: ${r.reviewedBy}${r.reviewedAt ? " em " + new Date(r.reviewedAt).toLocaleDateString("pt-BR") : ""}`, 55, y + 11, { width: pageWidth - 10, align: "right" });
        }
        y += noteHeight;
      }
    }

    y += 16;

    // ── Resumo Estatístico ────────────────────────────────────────────────────
    if (y + 80 > doc.page.height - 80) {
      drawFooter();
      doc.addPage();
      doc.rect(0, 0, doc.page.width, 8).fill(BLUE);
      y = 30;
    }

    const aprovados = data.results.filter((r) => r.status === "APROVADO").length;
    const reprovados = data.results.filter((r) => r.status === "REPROVADO").length;
    const revisao = data.results.filter((r) => r.status === "REVISAO" || !r.status).length;
    const avgScore = data.results.length > 0
      ? data.results.reduce((acc, r) => acc + Number(r.score ?? 0), 0) / data.results.length
      : 0;

    doc.rect(50, y, pageWidth, 18).fill(BLUE);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE).text("RESUMO DA ANÁLISE", 55, y + 5, { width: pageWidth - 10 });
    y += 22;

    const summaryW = pageWidth / 4;
    const summaryItems = [
      { label: "Total Avaliados", value: String(data.results.length), color: DARK },
      { label: "Aprovados", value: String(aprovados), color: GREEN },
      { label: "Reprovados", value: String(reprovados), color: RED },
      { label: "Score Médio", value: `${Math.round(avgScore * 100)}%`, color: BLUE },
    ];
    cx = 50;
    for (const s of summaryItems) {
      doc.rect(cx, y, summaryW - 4, 40).fill(LIGHT).stroke(BORDER);
      doc.font("Helvetica-Bold").fontSize(18).fillColor(s.color).text(s.value, cx + 4, y + 6, { width: summaryW - 12, align: "center" });
      doc.font("Helvetica").fontSize(7).fillColor(GRAY).text(s.label.toUpperCase(), cx + 4, y + 28, { width: summaryW - 12, align: "center" });
      cx += summaryW;
    }
    y += 50;

    // ── Conclusão e Assinatura ────────────────────────────────────────────────
    if (y + 120 > doc.page.height - 80) {
      drawFooter();
      doc.addPage();
      doc.rect(0, 0, doc.page.width, 8).fill(BLUE);
      y = 30;
    }

    y += 10;
    doc.rect(50, y, pageWidth, 18).fill(BLUE);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE).text("CONCLUSÃO E DECLARAÇÃO", 55, y + 5, { width: pageWidth - 10 });
    y += 22;

    const conclusionText = aprovados > 0
      ? `Com base na análise técnica comparativa realizada, foram identificados ${aprovados} produto(s) tecnicamente equivalente(s) ao produto de referência "${ref.name}", atendendo aos requisitos técnicos estabelecidos no edital, conforme critérios de equivalência por ficha técnica estruturada (princípio ativo, concentração, forma farmacêutica, classe terapêutica e espécie-alvo). A equivalência técnica foi verificada em conformidade com o Art. 7º, §1º, da Lei 14.133/2021 e com as diretrizes do órgão regulatório competente.`
      : `Com base na análise técnica comparativa realizada, nenhum dos ${data.results.length} candidato(s) avaliado(s) atendeu plenamente aos requisitos técnicos do produto de referência "${ref.name}". Recomenda-se a revisão dos critérios de equivalência ou a busca de novos candidatos.`;

    doc.rect(50, y, pageWidth, 60).fill(WHITE).stroke(BORDER);
    doc.font("Helvetica").fontSize(8).fillColor(DARK).text(conclusionText, 55, y + 8, { width: pageWidth - 10, align: "justify" });
    y += 68;

    // Assinatura
    y += 10;
    const sigW = pageWidth / 2 - 20;
    doc.rect(50, y, sigW, 50).fill(LIGHT).stroke(BORDER);
    doc.font("Helvetica").fontSize(7).fillColor(GRAY).text("Responsável pela Análise:", 55, y + 6, { width: sigW - 10 });
    doc.moveTo(55, y + 35).lineTo(55 + sigW - 10, y + 35).strokeColor(DARK).lineWidth(0.5).stroke();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(DARK).text(data.session.createdBy, 55, y + 38, { width: sigW - 10, align: "center" });

    doc.rect(50 + sigW + 20, y, sigW, 50).fill(LIGHT).stroke(BORDER);
    doc.font("Helvetica").fontSize(7).fillColor(GRAY).text("Data:", 55 + sigW + 20, y + 6, { width: sigW - 10 });
    doc.moveTo(55 + sigW + 20, y + 35).lineTo(55 + sigW * 2 + 10, y + 35).strokeColor(DARK).lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor(DARK).text(
      new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
      55 + sigW + 20, y + 38, { width: sigW - 10, align: "center" }
    );

    drawFooter();
    doc.end();
  });
}
