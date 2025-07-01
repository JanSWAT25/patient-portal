import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { 
  ArrowLeft, 
  Download, 
  FileText, 
  Calendar,
  BarChart3,
  Activity,
  TrendingUp
} from 'lucide-react';
import axios from 'axios';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.js`;

const RecordDetail = () => {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfUrl, setPdfUrl] = useState(null);

  useEffect(() => {
    fetchRecordDetails();
  }, [id]);

  useEffect(() => {
    // Fetch PDF as blob and create object URL
    const fetchPdf = async () => {
      if (record && record.filename) {
        try {
          const response = await fetch(`/api/pdf/${record.filename}`);
          if (!response.ok) throw new Error('Failed to fetch PDF');
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
        } catch (e) {
          setPdfUrl(null);
        }
      }
    };
    fetchPdf();
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line
  }, [record]);

  const fetchRecordDetails = async () => {
    try {
      const [recordResponse, analysisResponse] = await Promise.all([
        axios.get(`/api/records/${id}`),
        axios.get(`/api/analyze/${id}`)
      ]);
      
      setRecord(recordResponse.data);
      setAnalysis(analysisResponse.data);
    } catch (error) {
      console.error('Error fetching record details:', error);
    } finally {
      setLoading(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-medical-600"></div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Record Not Found</h1>
          <Link
            to="/records"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-medical-600 hover:bg-medical-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Records
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/records"
          className="inline-flex items-center text-medical-600 hover:text-medical-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Records
        </Link>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{record.original_name}</h1>
            <p className="mt-2 text-gray-600">
              {record.record_type || 'Unknown Type'} • Uploaded {formatDate(record.upload_date)}
            </p>
          </div>
          
          <a
            href={`/api/pdf/${record.filename}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 border border-medical-300 text-sm font-medium rounded-md text-medical-700 bg-medical-50 hover:bg-medical-100"
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* PDF Viewer */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            Document Viewer
          </h2>
          
          <div className="border border-gray-200 rounded-lg p-4">
            {pdfUrl ? (
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                className="flex justify-center"
              >
                <Page 
                  pageNumber={pageNumber} 
                  width={400}
                  className="shadow-lg"
                />
              </Document>
            ) : (
              <div className="text-center text-gray-500">Failed to load PDF file.</div>
            )}
            {numPages && (
              <div className="mt-4 flex items-center justify-center space-x-4">
                <button
                  onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                  disabled={pageNumber <= 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {pageNumber} of {numPages}
                </span>
                <button
                  onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                  disabled={pageNumber >= numPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Analysis */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2" />
            Document Analysis
          </h2>
          
          {analysis && (
            <div className="space-y-6">
              {/* Basic Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-medical-600">{analysis.wordCount}</div>
                  <div className="text-sm text-gray-600">Words</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-medical-600">{analysis.characterCount}</div>
                  <div className="text-sm text-gray-600">Characters</div>
                </div>
              </div>

              {/* Medical Terms */}
              {analysis.medicalTerms && analysis.medicalTerms.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                    <Activity className="h-4 w-4 mr-2" />
                    Medical Terms Found
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {analysis.medicalTerms.map((term, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-medical-100 text-medical-800 text-sm rounded-full"
                      >
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Numerical Data Chart */}
              {analysis.numericalData && analysis.numericalData.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Numerical Values
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysis.numericalData.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="unit" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#0ea5e9" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* File Info */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-medium text-gray-900 mb-3">File Information</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>File Size:</span>
                    <span>{formatFileSize(record.file_size)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Upload Date:</span>
                    <span>{formatDate(record.upload_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Record Type:</span>
                    <span>{record.record_type || 'Unknown'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecordDetail; 