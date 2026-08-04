import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dados ficam frescos por 30s — evita re-fetches desnecessários em navegação
      staleTime: 30_000,
      // Cache mantido por 5 minutos após componente desmontar
      gcTime: 5 * 60_000,
      // Não retentar em erros de autenticação
      retry: (failureCount, error) => {
        if (error instanceof TRPCClientError && (error.data?.httpStatus === 401 || error.data?.httpStatus === 403)) return false;
        return failureCount < 2;
      },
      // Não refetch ao focar janela (evita queries desnecessárias)
      refetchOnWindowFocus: false,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

// Procedimentos de importação que enviam payloads grandes — usam httpLink (sem batching)
const LARGE_PAYLOAD_PROCEDURES = new Set([
  "imports.processUploadV2",
  "imports.startBatchImport",
  "imports.previewCategoryClassification",
  "imports.applyCategoryReviewToCatalog",
  "masterProducts.previewWithDuplicates",
  "masterProducts.previewImportFuzzy",
  "equivalences.preview",
  "equivalences.applyAuto",
  "nfeImport.previewBatchXmlImport",
  "nfeImport.importBatchXml",
]);

const fetchWithCredentials: typeof globalThis.fetch = (input, init) =>
  globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      // Mutations de importação com payload grande → httpLink (sem batching)
      condition(op) {
        return op.type === "mutation" && LARGE_PAYLOAD_PROCEDURES.has(op.path);
      },
      true: httpLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: fetchWithCredentials,
      }),
      // Todas as outras operações → httpBatchLink (eficiente para queries normais)
      false: httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: fetchWithCredentials,
        maxURLLength: 2083,
      }),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
