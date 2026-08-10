/**
 * @deprecated Fachada temporária de compatibilidade.
 *
 * A implementação operacional foi decomposta por responsabilidade:
 * - captureJobProcessor: execução de jobs e quality gates;
 * - captureObservationService: leitura da fila de revisão;
 * - captureReviewService: decisão humana transacional.
 *
 * Novos consumidores devem importar os serviços específicos diretamente.
 */

export { processCaptureJob as processCaptureJobSafe } from "./captureJobProcessor";
export { listCaptureReviewObservations as listSafeCaptureReviewQueue } from "./captureObservationService";
export { decideCaptureObservationTransactional as decideSafeCaptureObservation } from "./captureReviewService";
