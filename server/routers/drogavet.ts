/**
 * routers/drogavet.ts
 * Router de Integração com Guia DrogaVet
 *
 * Endpoints:
 *  drogavet.searchActives       → buscar princípios ativos por termo
 *  drogavet.searchFormulas      → buscar fórmulas por termo
 *  drogavet.getActive           → obter detalhes de um princípio ativo
 *  drogavet.getFormula          → obter detalhes de uma fórmula
 */

import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";

export const drogavetRouter = router({
  /**
   * Buscar princípios ativos do Guia DrogaVet por termo
   */
  searchActives: publicProcedure
    .input(z.object({
      term: z.string().min(1).max(100),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      // Retornar dados estáticos do Guia DrogaVet
      const actives = [
        { id: 1, nome: "Óleo de Melaleuca", classe: "antifungico", funcao: "Antifúngico tópico", dosagem: "2-5%" },
        { id: 2, nome: "Nanoclimbazol", classe: "antifungico", funcao: "Antifúngico de amplo espectro", dosagem: "0,5-1%" },
        { id: 3, nome: "Clorexidine", classe: "antifungico", funcao: "Antisséptico e antifúngico", dosagem: "0,5-4%" },
        { id: 4, nome: "Cetoconazol", classe: "antifungico", funcao: "Antifúngico sistêmico", dosagem: "5-10 mg/kg/dia" },
        { id: 5, nome: "Ciclopirox", classe: "antifungico", funcao: "Antifúngico de amplo espectro", dosagem: "1%" },
        { id: 6, nome: "Itraconazol", classe: "antifungico", funcao: "Antifúngico sistêmico", dosagem: "5-10 mg/kg/dia" },
        { id: 7, nome: "Terbinafina", classe: "antifungico", funcao: "Antifúngico sistêmico", dosagem: "10-15 mg/kg/dia" },
        { id: 8, nome: "Equinácea", classe: "fitoterápico", funcao: "Imunoestimulante", dosagem: "2-5%" },
        { id: 9, nome: "Óleo de Neem", classe: "ectoparasiticida", funcao: "Antipulgas e anticarrapatos", dosagem: "2-5%" },
        { id: 10, nome: "Permetrina", classe: "ectoparasiticida", funcao: "Ectoparasiticida piretroide", dosagem: "0,5-5%" },
        { id: 11, nome: "Citronela", classe: "ectoparasiticida", funcao: "Repelente natural", dosagem: "2-5%" },
        { id: 12, nome: "Iodo", classe: "antifungico", funcao: "Antisséptico", dosagem: "0,5-2%" },
      ];

      const filtered = actives.filter(a =>
        a.nome.toLowerCase().includes(input.term.toLowerCase()) ||
        a.funcao.toLowerCase().includes(input.term.toLowerCase())
      );

      return filtered.slice(0, input.limit);
    }),

  /**
   * Buscar fórmulas do Guia DrogaVet por termo
   */
  searchFormulas: publicProcedure
    .input(z.object({
      term: z.string().min(1).max(100),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      // Retornar dados estáticos das fórmulas
      const formulas = [
        { id: 1, nome: "Xampu com Óleo de Melaleuca", classe: "Antifúngico", indicacoes: "Dermatites fúngicas", pagina: 128 },
        { id: 2, nome: "Xampu emoliente com Nanoclimbazol e Clorexidine", classe: "Antifúngico", indicacoes: "Dermatites alérgicas", pagina: 128 },
        { id: 3, nome: "Mousse com Nanomelaleuca", classe: "Antifúngico", indicacoes: "Otites externas", pagina: 129 },
        { id: 4, nome: "Spray com Nanomelaleuca e Terbinafina", classe: "Antifúngico", indicacoes: "Dermatófitos", pagina: 129 },
        { id: 5, nome: "Gel antifúngico com Equinácea", classe: "Antifúngico", indicacoes: "Dermatites fúngicas", pagina: 129 },
        { id: 6, nome: "Mousse com Cetoconazol", classe: "Antifúngico", indicacoes: "Dermatófitos, Malassezia", pagina: 130 },
        { id: 7, nome: "Spray fitoterápico antipulgas", classe: "Ectoparasiticida", indicacoes: "Pulgas", pagina: 133 },
        { id: 8, nome: "Spray antipulgas com Óleo de Neem", classe: "Ectoparasiticida", indicacoes: "Pulgas, carrapatos", pagina: 133 },
        { id: 9, nome: "Fórmula pour-on com Óleo de Neem", classe: "Ectoparasiticida", indicacoes: "Pulgas, carrapatos", pagina: 134 },
        { id: 10, nome: "Spray antipulgas com Permetrina", classe: "Ectoparasiticida", indicacoes: "Pulgas, carrapatos", pagina: 135 },
        { id: 11, nome: "Xampu antipulgas com Permetrina e Óleos", classe: "Ectoparasiticida", indicacoes: "Pulgas, carrapatos", pagina: 135 },
      ];

      const filtered = formulas.filter(f =>
        f.nome.toLowerCase().includes(input.term.toLowerCase()) ||
        f.indicacoes.toLowerCase().includes(input.term.toLowerCase())
      );

      return filtered.slice(0, input.limit);
    }),

  /**
   * Obter detalhes completos de um princípio ativo
   */
  getActive: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const actives: Record<number, any> = {
        1: { id: 1, nome: "Óleo de Melaleuca", classe: "antifungico", funcao: "Antifúngico tópico com propriedades antimicrobianas", dosagem_caes_gatos: "Tópico: 2-5%", dosagem_especies: "Tópico: 2-5%", apresentacoes: ["Xampu", "Spray", "Óleo"], notas: "Uso tópico seguro" },
        2: { id: 2, nome: "Cetoconazol", classe: "antifungico", funcao: "Antifúngico sistêmico e tópico", dosagem_caes_gatos: "Sistêmico: 5-10 mg/kg/dia", dosagem_especies: "Sistêmico: 5-10 mg/kg/dia", apresentacoes: ["Xampu", "Comprimido", "Spray"], notas: "Eficaz contra Malassezia" },
        9: { id: 9, nome: "Óleo de Neem", classe: "ectoparasiticida", funcao: "Ectoparasiticida natural", dosagem_caes_gatos: "Tópico: 2-5%", dosagem_especies: "Tópico: 2-5%", apresentacoes: ["Spray", "Pour-on", "Xampu"], notas: "Seguro para uso contínuo" },
      };
      return actives[input.id] || null;
    }),

  /**
   * Obter detalhes completos de uma fórmula
   */
  getFormula: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const formulas: Record<number, any> = {
        1: { id: 1, nome: "Xampu com Óleo de Melaleuca", classe: "Antifúngico", principios_ativos: ["Óleo de Melaleuca"], indicacoes: "Dermatites fúngicas, otites externas", modo_preparo: "Xampu base + 3-5% de óleo de melaleuca", posologia: "Aplicar 2x/semana", pagina: 128 },
        7: { id: 7, nome: "Spray fitoterápico antipulgas", classe: "Ectoparasiticida", principios_ativos: ["Óleo de Neem", "Citronela"], indicacoes: "Pulgas, prevenção", modo_preparo: "Spray base + 3% óleo de neem + 2% citronela", posologia: "Aplicar 1x/dia", pagina: 133 },
      };
      return formulas[input.id] || null;
    }),

  /**
   * Listar todos os princípios ativos
   */
  listAllActives: publicProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const actives = [
        { id: 1, nome: "Óleo de Melaleuca", classe: "antifungico", funcao: "Antifúngico tópico" },
        { id: 2, nome: "Nanoclimbazol", classe: "antifungico", funcao: "Antifúngico de amplo espectro" },
        { id: 3, nome: "Clorexidine", classe: "antifungico", funcao: "Antisséptico" },
        { id: 4, nome: "Cetoconazol", classe: "antifungico", funcao: "Antifúngico sistêmico" },
        { id: 5, nome: "Ciclopirox", classe: "antifungico", funcao: "Antifúngico" },
        { id: 6, nome: "Itraconazol", classe: "antifungico", funcao: "Antifúngico sistêmico" },
        { id: 7, nome: "Terbinafina", classe: "antifungico", funcao: "Antifúngico sistêmico" },
        { id: 8, nome: "Equinácea", classe: "fitoterápico", funcao: "Imunoestimulante" },
        { id: 9, nome: "Óleo de Neem", classe: "ectoparasiticida", funcao: "Antipulgas" },
        { id: 10, nome: "Permetrina", classe: "ectoparasiticida", funcao: "Ectoparasiticida" },
        { id: 11, nome: "Citronela", classe: "ectoparasiticida", funcao: "Repelente" },
        { id: 12, nome: "Iodo", classe: "antifungico", funcao: "Antisséptico" },
      ];

      const offset = (input.page - 1) * input.pageSize;
      const items = actives.slice(offset, offset + input.pageSize);

      return { items, total: actives.length, page: input.page };
    }),

  /**
   * Listar todas as fórmulas
   */
  listAllFormulas: publicProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const formulas = [
        { id: 1, nome: "Xampu com Óleo de Melaleuca", classe: "Antifúngico", indicacoes: "Dermatites fúngicas" },
        { id: 2, nome: "Xampu emoliente com Nanoclimbazol", classe: "Antifúngico", indicacoes: "Dermatites alérgicas" },
        { id: 3, nome: "Mousse com Nanomelaleuca", classe: "Antifúngico", indicacoes: "Otites externas" },
        { id: 4, nome: "Spray com Nanomelaleuca e Terbinafina", classe: "Antifúngico", indicacoes: "Dermatófitos" },
        { id: 5, nome: "Gel antifúngico com Equinácea", classe: "Antifúngico", indicacoes: "Dermatites" },
        { id: 6, nome: "Mousse com Cetoconazol", classe: "Antifúngico", indicacoes: "Dermatófitos" },
        { id: 7, nome: "Spray fitoterápico antipulgas", classe: "Ectoparasiticida", indicacoes: "Pulgas" },
        { id: 8, nome: "Spray antipulgas com Óleo de Neem", classe: "Ectoparasiticida", indicacoes: "Pulgas, carrapatos" },
        { id: 9, nome: "Fórmula pour-on com Óleo de Neem", classe: "Ectoparasiticida", indicacoes: "Pulgas, carrapatos" },
        { id: 10, nome: "Spray antipulgas com Permetrina", classe: "Ectoparasiticida", indicacoes: "Pulgas, carrapatos" },
        { id: 11, nome: "Xampu antipulgas com Permetrina", classe: "Ectoparasiticida", indicacoes: "Pulgas, carrapatos" },
      ];

      const offset = (input.page - 1) * input.pageSize;
      const items = formulas.slice(offset, offset + input.pageSize);

      return { items, total: formulas.length, page: input.page };
    }),
});
