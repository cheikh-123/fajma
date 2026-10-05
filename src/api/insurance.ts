/** Assurances : organismes, couvertures du patient, organismes acceptés par le médecin. */
import { api } from "./client";
import type { AcceptedInsurer, Coverage, Insurer } from "./types";

export const listInsurers = () => api.get<Insurer[]>("/insurance/insurers");

export const listMyCoverages = () => api.get<Coverage[]>("/insurance/coverages");

export const addCoverage = ({
  data,
}: {
  data: {
    insurer_id: string;
    member_number: string;
    coverage_percent: number;
    valid_until?: string;
    relative_id?: string;
  };
}) => api.post<Coverage[]>("/insurance/coverages", data);

/** Correction d'une couverture : n° d'adhérent, taux, fin de validité (organisme et bénéficiaire inchangés). */
export const updateCoverage = (data: {
  id: string;
  member_number: string;
  coverage_percent: number;
  valid_until?: string;
}) => api.post<Coverage[]>("/insurance/coverages", data);

export const deleteCoverage = (id: string) =>
  api.post<{ ok: true }>(`/insurance/coverages/${id}/delete`);

export const getMyAcceptedInsurers = () => api.get<AcceptedInsurer[]>("/insurance/pro");

export const setMyAcceptedInsurers = ({
  data,
}: {
  data: { insurer_id: string; tiers_payant: boolean }[];
}) => api.post<AcceptedInsurer[]>("/insurance/pro", { insurers: data });

/** Part restant à la charge du patient, calculée comme côté serveur (arrondi en faveur du patient). */
export const patientShare = (price: number, percent: number) =>
  price - Math.floor((price * percent) / 100);
