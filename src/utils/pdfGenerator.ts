/**
 * PDF Generation Utility for Thematic Analysis Reports
 * 
 * This utility generates comprehensive PDF reports from thematic analysis results
 * including summary statistics, theme breakdowns, demographic insights, and visualizations.
 */

import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface Comment {
  id: string;
  text: string;
  department?: string;
  gender?: string;
  age?: string;
  role?: string;
  location?: string;
  [key: string]: any;
}

interface Theme {
  id: string;
  name: string;
  description: string;
  frequency: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  keywords: string[];
  comments: Comment[];
}

interface DemographicBreakdown {
  department: Record<string, Theme[]>;
  gender: Record<string, Theme[]>;
  age: Record<string, Theme[]>;
  role: Record<string, Theme[]>;
}

interface AnalysisResult {
  themes: Theme[];
  demographicBreakdown: DemographicBreakdown;
  summary: {
    totalComments: number;
    totalThemes: number;
    averageSentiment: number;
    topTheme: Theme;
  };
  taggedComments: Comment[];
}

export class ThematicAnalysisPDFGenerator {
  private doc: jsPDF;
  private currentY: number = 20;
  private pageHeight: number = 280; // A4 page height in mm
  private margin: number = 20;

  constructor() {
    this.doc = new jsPDF();
    this.setupDocument();
  }

  private setupDocument(): void {
    // Set up the document with proper fonts and styling
    this.doc.setProperties({
      title: 'Thematic Analysis Report',
      subject: 'Employee Feedback Analysis',
      author: 'Excel Scribe Studio',
      creator: 'Excel Scribe Studio'
    });
  }

  private addHeader(): void {
    // Company logo and title
    this.doc.setFontSize(24);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Thematic Analysis Report', this.margin, this.currentY);
    
    this.currentY += 15;
    
    // Subtitle
    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text('Employee Feedback Analysis Report', this.margin, this.currentY);
    
    this.currentY += 10;
    
    // Date
    this.doc.setFontSize(10);
    this.doc.text(`Generated on: ${new Date().toLocaleDateString()}`, this.margin, this.currentY);
    
    this.currentY += 20;
  }

  private addSummarySection(result: AnalysisResult): void {
    this.addSectionTitle('Executive Summary');
    
    // Summary statistics
    const summaryData = [
      ['Total Comments Analyzed', result.summary.totalComments.toString()],
      ['Themes Identified', result.summary.totalThemes.toString()],
      ['Average Sentiment Score', result.summary.averageSentiment.toFixed(2)],
      ['Most Frequent Theme', result.summary.topTheme.name],
      ['Top Theme Frequency', `${result.summary.topTheme.frequency} comments`]
    ];

    this.doc.autoTable({
      startY: this.currentY,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [147, 51, 234] }, // Purple color
      styles: { fontSize: 10 },
      margin: { left: this.margin, right: this.margin }
    });

    this.currentY = (this.doc as any).lastAutoTable.finalY + 15;
  }

  private addThemesSection(result: AnalysisResult): void {
    this.addSectionTitle('Identified Themes');
    
    // Prepare themes data for table
    const themesData = result.themes.map(theme => [
      theme.name,
      theme.description,
      theme.frequency.toString(),
      theme.sentiment,
      theme.keywords.slice(0, 3).join(', ') + (theme.keywords.length > 3 ? '...' : '')
    ]);

    this.doc.autoTable({
      startY: this.currentY,
      head: [['Theme', 'Description', 'Frequency', 'Sentiment', 'Key Terms']],
      body: themesData,
      theme: 'grid',
      headStyles: { fillColor: [147, 51, 234] },
      styles: { fontSize: 9 },
      columnStyles: {
        1: { cellWidth: 50 }, // Description column wider
        4: { cellWidth: 30 }   // Key terms column
      },
      margin: { left: this.margin, right: this.margin },
      didDrawPage: (data) => {
        this.currentY = data.cursor.y + 10;
      }
    });

    this.currentY = (this.doc as any).lastAutoTable.finalY + 15;
  }

  private addDemographicsSection(result: AnalysisResult): void {
    this.addSectionTitle('Demographic Breakdown');
    
    // Department breakdown
    if (Object.keys(result.demographicBreakdown.department).length > 0) {
      this.addSubsectionTitle('By Department');
      
      const deptData = Object.entries(result.demographicBreakdown.department).map(([dept, themes]) => [
        dept,
        themes.length.toString(),
        themes.map(t => t.name).join(', ')
      ]);

      this.doc.autoTable({
        startY: this.currentY,
        head: [['Department', 'Themes Count', 'Themes']],
        body: deptData,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] }, // Blue color
        styles: { fontSize: 9 },
        margin: { left: this.margin, right: this.margin },
        didDrawPage: (data) => {
          this.currentY = data.cursor.y + 10;
        }
      });

      this.currentY = (this.doc as any).lastAutoTable.finalY + 10;
    }

    // Gender breakdown
    if (Object.keys(result.demographicBreakdown.gender).length > 0) {
      this.addSubsectionTitle('By Gender');
      
      const genderData = Object.entries(result.demographicBreakdown.gender).map(([gender, themes]) => [
        gender,
        themes.length.toString(),
        themes.map(t => t.name).join(', ')
      ]);

      this.doc.autoTable({
        startY: this.currentY,
        head: [['Gender', 'Themes Count', 'Themes']],
        body: genderData,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] }, // Green color
        styles: { fontSize: 9 },
        margin: { left: this.margin, right: this.margin },
        didDrawPage: (data) => {
          this.currentY = data.cursor.y + 10;
        }
      });

      this.currentY = (this.doc as any).lastAutoTable.finalY + 10;
    }

    // Age breakdown
    if (Object.keys(result.demographicBreakdown.age).length > 0) {
      this.addSubsectionTitle('By Age Group');
      
      const ageData = Object.entries(result.demographicBreakdown.age).map(([age, themes]) => [
        age,
        themes.length.toString(),
        themes.map(t => t.name).join(', ')
      ]);

      this.doc.autoTable({
        startY: this.currentY,
        head: [['Age Group', 'Themes Count', 'Themes']],
        body: ageData,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11] }, // Orange color
        styles: { fontSize: 9 },
        margin: { left: this.margin, right: this.margin },
        didDrawPage: (data) => {
          this.currentY = data.cursor.y + 10;
        }
      });

      this.currentY = (this.doc as any).lastAutoTable.finalY + 10;
    }
  }

  private addSampleCommentsSection(result: AnalysisResult): void {
    this.addSectionTitle('Sample Comments by Theme');
    
    // Show top 3 themes with sample comments
    const topThemes = result.themes
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3);

    topThemes.forEach((theme, index) => {
      this.addSubsectionTitle(`${index + 1}. ${theme.name} (${theme.frequency} comments)`);
      
      // Get sample comments for this theme
      const sampleComments = theme.comments.slice(0, 3);
      
      sampleComments.forEach((comment, commentIndex) => {
        this.doc.setFontSize(9);
        this.doc.setFont('helvetica', 'normal');
        
        // Comment text
        const commentText = `Comment ${commentIndex + 1}: ${comment.text}`;
        const splitText = this.doc.splitTextToSize(commentText, 170);
        this.doc.text(splitText, this.margin, this.currentY);
        this.currentY += splitText.length * 4 + 5;
        
        // Demographics if available
        const demographics = [];
        if (comment.department) demographics.push(`Dept: ${comment.department}`);
        if (comment.gender) demographics.push(`Gender: ${comment.gender}`);
        if (comment.age) demographics.push(`Age: ${comment.age}`);
        
        if (demographics.length > 0) {
          this.doc.setFontSize(8);
          this.doc.setFont('helvetica', 'italic');
          this.doc.text(demographics.join(' | '), this.margin, this.currentY);
          this.currentY += 8;
        }
        
        this.currentY += 5;
      });
      
      this.currentY += 10;
    });
  }

  private addSectionTitle(title: string): void {
    // Check if we need a new page
    if (this.currentY > this.pageHeight - 50) {
      this.doc.addPage();
      this.currentY = 20;
    }
    
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(title, this.margin, this.currentY);
    this.currentY += 10;
  }

  private addSubsectionTitle(title: string): void {
    // Check if we need a new page
    if (this.currentY > this.pageHeight - 30) {
      this.doc.addPage();
      this.currentY = 20;
    }
    
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(title, this.margin, this.currentY);
    this.currentY += 8;
  }

  private addFooter(): void {
    const pageCount = this.doc.getNumberOfPages();
    
    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(
        `Page ${i} of ${pageCount} - Generated by Excel Scribe Studio`,
        this.margin,
        this.pageHeight + 10
      );
    }
  }

  public generateReport(result: AnalysisResult): void {
    try {
      this.addHeader();
      this.addSummarySection(result);
      this.addThemesSection(result);
      this.addDemographicsSection(result);
      this.addSampleCommentsSection(result);
      this.addFooter();
      
      // Save the PDF
      const fileName = `thematic-analysis-report-${new Date().toISOString().split('T')[0]}.pdf`;
      this.doc.save(fileName);
      
    } catch (error) {
      console.error('Error generating PDF report:', error);
      throw new Error('Failed to generate PDF report');
    }
  }

  public generateReportBlob(result: AnalysisResult): Blob {
    try {
      this.addHeader();
      this.addSummarySection(result);
      this.addThemesSection(result);
      this.addDemographicsSection(result);
      this.addSampleCommentsSection(result);
      this.addFooter();
      
      return this.doc.output('blob');
      
    } catch (error) {
      console.error('Error generating PDF report blob:', error);
      throw new Error('Failed to generate PDF report');
    }
  }
}

// Export utility function for easy use
export const generateThematicAnalysisPDF = (result: AnalysisResult): void => {
  const generator = new ThematicAnalysisPDFGenerator();
  generator.generateReport(result);
};

export const generateThematicAnalysisPDFBlob = (result: AnalysisResult): Blob => {
  const generator = new ThematicAnalysisPDFGenerator();
  return generator.generateReportBlob(result);
};
