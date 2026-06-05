// ============================================================
// EXPORT PDF — jsPDF + html2canvas
// npm install jspdf html2canvas --save  (dans frontend/)
// ============================================================
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const exportToPDF = async (elementId, filename = 'export') => {
  const element = document.getElementById(elementId);
  if (!element) {
    alert('Élément introuvable pour l\'export PDF.');
    return;
  }
  try {
    const canvas  = await html2canvas(element, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf     = new jsPDF('l', 'mm', 'a4');
    const pdfW    = pdf.internal.pageSize.getWidth();
    const pdfH    = (canvas.height * pdfW) / canvas.width;

    if (pdfH <= pdf.internal.pageSize.getHeight()) {
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    } else {
      // Multi-page si le contenu dépasse une page
      const pageH = pdf.internal.pageSize.getHeight();
      let position = 0;
      while (position < pdfH) {
        pdf.addImage(imgData, 'PNG', 0, -position, pdfW, pdfH);
        position += pageH;
        if (position < pdfH) pdf.addPage();
      }
    }

    pdf.save(`${filename}_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`);
  } catch (err) {
    console.error('Erreur export PDF:', err);
    alert('Erreur lors de la génération du PDF.');
  }
};
