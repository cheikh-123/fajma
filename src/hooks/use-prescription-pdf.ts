import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMyPrescriptionPdf } from "@/api/documents";

export function usePrescriptionPdf() {
  return useMutation({
    mutationFn: (id: string) => getMyPrescriptionPdf({ data: { id } }),
    onSuccess: (res) => {
      const binary = atob(res.content_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = res.file_name;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Ordonnance PDF téléchargée");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
