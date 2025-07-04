import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  TrendingUp, 
  Activity, 
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  LineChart,
  Target,
  TrendingDown,
  Minus,
  Brain,
  FileText,
  Heart,
  Shield,
  Lightbulb,
  ArrowUp,
  ArrowDown,
  ArrowRight
} from 'lucide-react';
import axios from 'axios';

const LabAnalytics = () => {
  const { user } = useAuth();
  const [aiAnalyses, setAiAnalyses] = useState([]);
  const [labValues, setLabValues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [viewMode, setViewMode] = useState('overview');
  const [reanalyzing, setReanalyzing] = useState(false);
  const [analyticsSummary, setAnalyticsSummary] = useState(null);
  const [availableTests, setAvailableTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedTest) {
      fetchTrendData(selectedTest);
    }
  }, [selectedTest]);

  const fetchData = async () => {
    try {
      const [aiResponse, labResponse, summaryResponse, testsResponse] = await Promise.all([
        axios.get('/api/ai-analysis'),
        axios.get('/api/lab-values'),
        axios.get('/api/lab-analytics/summary'),
        axios.get('/api/lab-values/test-names')
      ]);
      
      setAiAnalyses(aiResponse.data);
      setLabValues(labResponse.data);
      setAnalyticsSummary(summaryResponse.data);
      setAvailableTests(testsResponse.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const reAnalyzeDocument = async (recordId) => {
    setReanalyzing(true);
    try {
      await axios.post(`/api/lab-values/extract/${recordId}`);
      await fetchData();
      alert('Document re-analyzed successfully!');
    } catch (error) {
      console.error('Error re-analyzing document:', error);
      alert('Failed to re-analyze document');
    } finally {
      setReanalyzing(false);
    }
  };

  const fetchTrendData = async (testName) => {
    try {
      const response = await axios.get(`/api/lab-values/trends/${testName}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching trend data:', error);
      return [];
    }
  };

  const getRiskLevelColor = (riskLevel) => {
    switch (riskLevel?.toLowerCase()) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getRiskLevelIcon = (riskLevel) => {
    switch (riskLevel?.toLowerCase()) {
      case 'high': return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'medium': return <Shield className="h-5 w-5 text-yellow-500" />;
      case 'low': return <CheckCircle className="h-5 w-5 text-green-500" />;
      default: return <Minus className="h-5 w-5 text-gray-500" />;
    }
  };

  const getTrendIcon = (trend) => {
    switch (trend?.toLowerCase()) {
      case 'improving': return <ArrowUp className="h-4 w-4 text-green-500" />;
      case 'declining': return <ArrowDown className="h-4 w-4 text-red-500" />;
      case 'stable': return <ArrowRight className="h-4 w-4 text-blue-500" />;
      default: return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, subtitle, trend }) => (
    <div className={`bg-white p-6 rounded-lg shadow-md border-l-4 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          {trend && (
            <div className="flex items-center mt-2">
              {getTrendIcon(trend)}
              <span className="text-sm text-gray-600 ml-1">
                {trend} trend
              </span>
            </div>
          )}
        </div>
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
    </div>
  );

  const AIAnalysisCard = ({ analysis }) => {
    const numericalData = analysis.numerical_data || {};
    const labTests = numericalData.lab_tests || [];
    const medicalMeasurements = numericalData.medical_measurements || [];
    const patientSummary = numericalData.patient_summary || {};
    const nonDataContent = numericalData.non_data_content || {};
    const bloodworkAnalysis = numericalData.bloodwork_analysis || {};
    const trends = analysis.trends || {};
    const recommendations = analysis.recommendations || [];

    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Brain className="h-6 w-6 text-medical-600 mr-3" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{analysis.record_name}</h3>
              <p className="text-sm text-gray-600">{analysis.record_type} • {new Date(analysis.analysis_date).toLocaleDateString()}</p>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full border ${getRiskLevelColor(analysis.risk_level)}`}>
            <div className="flex items-center">
              {getRiskLevelIcon(analysis.risk_level)}
              <span className="ml-1 text-sm font-medium capitalize">{analysis.risk_level || 'Unknown'}</span>
            </div>
          </div>
        </div>

        {/* Document Summary */}
        {analysis.summary && (
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-900 mb-2 flex items-center">
              <FileText className="h-4 w-4 mr-2" />
              Document Summary
            </h4>
            <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{analysis.summary}</p>
          </div>
        )}

        {/* Patient Summary */}
        {patientSummary.overall_health_status && (
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-900 mb-2 flex items-center">
              <Heart className="h-4 w-4 mr-2" />
              Your Health Summary
            </h4>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="mb-3">
                <span className="text-sm font-medium text-blue-800">Overall Health Status: </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ml-2 ${
                  patientSummary.overall_health_status === 'Good' ? 'bg-green-100 text-green-800' :
                  patientSummary.overall_health_status === 'Fair' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {patientSummary.overall_health_status}
                </span>
              </div>
              
              {patientSummary.what_this_means && (
                <div className="mb-3">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">What this means: </span>
                    {patientSummary.what_this_means}
                  </p>
                </div>
              )}
              
              {patientSummary.key_points && patientSummary.key_points.length > 0 && (
                <div className="mb-3">
                  <p className="text-sm font-medium text-blue-800 mb-2">Key Points:</p>
                  <ul className="text-sm text-blue-700 space-y-1">
                    {patientSummary.key_points.map((point, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-blue-600 mr-2">•</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {patientSummary.next_steps && patientSummary.next_steps.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-blue-800 mb-2">Next Steps:</p>
                  <ul className="text-sm text-blue-700 space-y-1">
                    {patientSummary.next_steps.map((step, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-blue-600 mr-2">→</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lab Tests Found */}
        {labTests.length > 0 && (
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
              <BarChart3 className="h-4 w-4 mr-2" />
              Lab Tests ({labTests.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {labTests.map((test, index) => (
                <div key={index} className={`p-3 rounded-lg border ${test.is_abnormal ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-gray-900">{test.test_name}</p>
                      <p className="text-sm text-gray-600">{test.test_category}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${test.is_abnormal ? 'text-red-600' : 'text-green-600'}`}>
                        {test.value} {test.unit}
                      </p>
                      {test.reference_range && (
                        <p className="text-xs text-gray-500">Ref: {test.reference_range}</p>
                      )}
                    </div>
                  </div>
                  {test.patient_explanation && (
                    <p className="text-xs text-gray-600 mt-2">{test.patient_explanation}</p>
                  )}
                  {test.trend && (
                    <div className="flex items-center mt-2">
                      {getTrendIcon(test.trend)}
                      <span className="text-xs text-gray-600 ml-1 capitalize">{test.trend}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trend Analysis */}
        {Object.keys(trends).length > 0 && (
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
              <TrendingUp className="h-4 w-4 mr-2" />
              Trend Analysis
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trends.improving_tests && trends.improving_tests.length > 0 && (
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <h5 className="font-medium text-green-800 mb-2 flex items-center">
                    <ArrowUp className="h-4 w-4 mr-1" />
                    Improving Tests
                  </h5>
                  <ul className="text-sm text-green-700">
                    {trends.improving_tests.map((test, index) => (
                      <li key={index}>• {test}</li>
                    ))}
                  </ul>
                </div>
              )}
              {trends.declining_tests && trends.declining_tests.length > 0 && (
                <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                  <h5 className="font-medium text-red-800 mb-2 flex items-center">
                    <ArrowDown className="h-4 w-4 mr-1" />
                    Declining Tests
                  </h5>
                  <ul className="text-sm text-red-700">
                    {trends.declining_tests.map((test, index) => (
                      <li key={index}>• {test}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bloodwork Analysis Charts */}
        {(bloodworkAnalysis.elements?.length > 0 || bloodworkAnalysis.chemicals?.length > 0 || bloodworkAnalysis.metals?.length > 0) && (
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
              <BarChart3 className="h-4 w-4 mr-2" />
              Bloodwork Analysis
            </h4>
            
            {/* Blood Elements */}
            {bloodworkAnalysis.elements?.length > 0 && (
              <div className="mb-4">
                <h5 className="text-sm font-medium text-gray-900 mb-2">Blood Elements</h5>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {bloodworkAnalysis.elements.map((element, index) => (
                      <div key={index} className={`p-3 rounded-lg border ${element.is_abnormal ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm text-gray-900">{element.element_name}</p>
                            <p className="text-xs text-gray-600">{element.element_type}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold text-sm ${element.is_abnormal ? 'text-red-600' : 'text-green-600'}`}>
                              {element.value} {element.unit}
                            </p>
                            {element.reference_range && (
                              <p className="text-xs text-gray-500">Ref: {element.reference_range}</p>
                            )}
                          </div>
                        </div>
                        {element.patient_meaning && (
                          <p className="text-xs text-gray-600 mt-2">{element.patient_meaning}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Chemicals */}
            {bloodworkAnalysis.chemicals?.length > 0 && (
              <div className="mb-4">
                <h5 className="text-sm font-medium text-gray-900 mb-2">Chemical Profile</h5>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {bloodworkAnalysis.chemicals.map((chemical, index) => (
                      <div key={index} className={`p-3 rounded-lg border ${chemical.is_abnormal ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm text-gray-900">{chemical.chemical_name}</p>
                            <p className="text-xs text-gray-600">{chemical.chemical_type}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold text-sm ${chemical.is_abnormal ? 'text-red-600' : 'text-green-600'}`}>
                              {chemical.value} {chemical.unit}
                            </p>
                            {chemical.reference_range && (
                              <p className="text-xs text-gray-500">Ref: {chemical.reference_range}</p>
                            )}
                          </div>
                        </div>
                        {chemical.patient_meaning && (
                          <p className="text-xs text-gray-600 mt-2">{chemical.patient_meaning}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Metals */}
            {bloodworkAnalysis.metals?.length > 0 && (
              <div className="mb-4">
                <h5 className="text-sm font-medium text-gray-900 mb-2">Metal Levels</h5>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {bloodworkAnalysis.metals.map((metal, index) => (
                      <div key={index} className={`p-3 rounded-lg border ${metal.is_abnormal ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm text-gray-900">{metal.metal_name}</p>
                            <p className="text-xs text-gray-600">{metal.metal_type}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold text-sm ${metal.is_abnormal ? 'text-red-600' : 'text-green-600'}`}>
                              {metal.value} {metal.unit}
                            </p>
                            {metal.reference_range && (
                              <p className="text-xs text-gray-500">Ref: {metal.reference_range}</p>
                            )}
                          </div>
                        </div>
                        {metal.patient_meaning && (
                          <p className="text-xs text-gray-600 mt-2">{metal.patient_meaning}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Non-Data Content */}
        {nonDataContent.clinical_notes?.length > 0 || nonDataContent.impressions?.length > 0 || nonDataContent.recommendations?.length > 0 && (
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
              <FileText className="h-4 w-4 mr-2" />
              Clinical Notes & Impressions
            </h4>
            
            {nonDataContent.clinical_notes?.length > 0 && (
              <div className="mb-4">
                <h5 className="text-sm font-medium text-gray-900 mb-2">Clinical Notes</h5>
                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                  <ul className="text-sm text-yellow-800 space-y-1">
                    {nonDataContent.clinical_notes.map((note, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-yellow-600 mr-2">•</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {nonDataContent.impressions?.length > 0 && (
              <div className="mb-4">
                <h5 className="text-sm font-medium text-gray-900 mb-2">Impressions</h5>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                  <ul className="text-sm text-purple-800 space-y-1">
                    {nonDataContent.impressions.map((impression, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-purple-600 mr-2">•</span>
                        <span>{impression}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {nonDataContent.recommendations?.length > 0 && (
              <div className="mb-4">
                <h5 className="text-sm font-medium text-gray-900 mb-2">Medical Recommendations</h5>
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <ul className="text-sm text-green-800 space-y-1">
                    {nonDataContent.recommendations.map((rec, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-green-600 mr-2">→</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
              <Lightbulb className="h-4 w-4 mr-2" />
              AI Recommendations
            </h4>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <ul className="space-y-2">
                {recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-blue-600 mr-2">•</span>
                    <span className="text-sm text-blue-800">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end">
          <button
            onClick={() => reAnalyzeDocument(analysis.record_id)}
            disabled={reanalyzing}
            className="flex items-center px-4 py-2 bg-medical-600 text-white rounded-lg hover:bg-medical-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${reanalyzing ? 'animate-spin' : ''}`} />
            {reanalyzing ? 'Re-analyzing...' : 'Re-analyze'}
          </button>
        </div>
      </div>
    );
  };

  const SimpleTrendChart = ({ data, testName }) => {
    if (!data || data.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          No trend data available for {testName}
        </div>
      );
    }

    const sortedData = data.sort((a, b) => new Date(a.test_date || a.extraction_date) - new Date(b.test_date || b.extraction_date));
    const values = sortedData.map(d => Number(d.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    return (
      <div className="bg-white rounded-lg shadow-md p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{testName} Trend</h3>
        <div className="flex items-end justify-between h-32 space-x-1">
          {sortedData.map((point, index) => {
            const height = range > 0 ? ((point.value - min) / range) * 100 : 50;
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className={`w-full rounded-t ${point.is_abnormal ? 'bg-red-500' : 'bg-medical-500'}`}
                  style={{ height: `${height}%` }}
                />
                <div className="text-xs text-gray-500 mt-1 text-center">
                  {point.value}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const BloodworkChart = ({ data, title, type = 'bar' }) => {
    if (!data || data.length === 0) {
      return null;
    }

    const maxValue = Math.max(...data.map(item => Number(item.value) || 0));
    const minValue = Math.min(...data.map(item => Number(item.value) || 0));
    const range = maxValue - minValue;

    return (
      <div className="bg-white rounded-lg shadow-md p-4 mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <div className="space-y-3">
          {data.map((item, index) => {
            const value = Number(item.value) || 0;
            const percentage = range > 0 ? ((value - minValue) / range) * 100 : 50;
            const color = item.is_abnormal ? '#ef4444' : '#0ea5e9';
            
            return (
              <div key={index} className="flex items-center space-x-3">
                <div className="w-24 text-sm font-medium text-gray-900 truncate">
                  {item.name}
                </div>
                <div className="flex-1 bg-gray-200 rounded-full h-4">
                  <div
                    className="h-4 rounded-full transition-all duration-300"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: color
                    }}
                  />
                </div>
                <div className="w-16 text-right">
                  <div className={`text-sm font-bold ${item.is_abnormal ? 'text-red-600' : 'text-green-600'}`}>
                    {item.value} {item.unit}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-medical-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <Brain className="h-8 w-8 mr-3 text-medical-600" />
          AI-Powered Lab Analytics
        </h1>
        <p className="mt-2 text-gray-600">
          Comprehensive analysis of your medical documents with AI insights, trends, and recommendations.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Documents Analyzed"
          value={aiAnalyses.length}
          icon={FileText}
          color="border-blue-500"
        />
        <StatCard
          title="Lab Tests Found"
          value={labValues.length}
          icon={BarChart3}
          color="border-green-500"
        />
        <StatCard
          title="Abnormal Results"
          value={labValues.filter(lab => lab.is_abnormal).length}
          icon={AlertTriangle}
          color="border-red-500"
        />
        <StatCard
          title="AI Insights"
          value={aiAnalyses.filter(a => a.summary).length}
          icon={Brain}
          color="border-purple-500"
        />
      </div>

      {/* View Mode Toggle */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex space-x-4">
            <button
              onClick={() => setViewMode('overview')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'overview' 
                  ? 'bg-medical-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              AI Analysis Overview
            </button>
            <button
              onClick={() => setViewMode('trends')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'trends' 
                  ? 'bg-medical-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Lab Trends
            </button>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'overview' ? (
        <div>
          {aiAnalyses.length === 0 ? (
            <div className="text-center py-12">
              <Brain className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No AI Analysis Available</h3>
              <p className="text-gray-600 mb-4">
                Upload medical documents to get AI-powered insights and analysis.
              </p>
            </div>
          ) : (
            <div>
              {aiAnalyses.map((analysis) => (
                <AIAnalysisCard key={analysis.id} analysis={analysis} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Test Selection */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Test for Trend Analysis</h3>
            <select
              value={selectedTest}
              onChange={(e) => setSelectedTest(e.target.value)}
              className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-500 focus:border-transparent"
            >
              <option value="">Choose a test...</option>
              {availableTests.map((test) => (
                <option key={test.test_name} value={test.test_name}>
                  {test.test_name} ({test.count} values)
                </option>
              ))}
            </select>
          </div>

          {/* Trend Chart */}
          {selectedTest && (
            <div className="mb-8">
              <SimpleTrendChart data={labValues.filter(lab => lab.test_name === selectedTest)} testName={selectedTest} />
            </div>
          )}

          {/* Bloodwork Charts */}
          {aiAnalyses.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Bloodwork Charts</h3>
              {aiAnalyses.map((analysis) => {
                const bloodworkAnalysis = analysis.numerical_data?.bloodwork_analysis || {};
                const graphData = analysis.numerical_data?.graph_data || {};
                
                return (
                  <div key={analysis.id} className="mb-6">
                    <h4 className="text-md font-medium text-gray-900 mb-3">{analysis.record_name}</h4>
                    
                    {/* Blood Elements Chart */}
                    {bloodworkAnalysis.elements?.length > 0 && (
                      <BloodworkChart
                        data={bloodworkAnalysis.elements.map(el => ({
                          name: el.element_name,
                          value: el.value,
                          unit: el.unit,
                          is_abnormal: el.is_abnormal
                        }))}
                        title="Blood Elements"
                        type="bar"
                      />
                    )}

                    {/* Chemicals Chart */}
                    {bloodworkAnalysis.chemicals?.length > 0 && (
                      <BloodworkChart
                        data={bloodworkAnalysis.chemicals.map(chem => ({
                          name: chem.chemical_name,
                          value: chem.value,
                          unit: chem.unit,
                          is_abnormal: chem.is_abnormal
                        }))}
                        title="Chemical Profile"
                        type="line"
                      />
                    )}

                    {/* Metals Chart */}
                    {bloodworkAnalysis.metals?.length > 0 && (
                      <BloodworkChart
                        data={bloodworkAnalysis.metals.map(metal => ({
                          name: metal.metal_name,
                          value: metal.value,
                          unit: metal.unit,
                          is_abnormal: metal.is_abnormal
                        }))}
                        title="Metal Levels"
                        type="bar"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* All Lab Values Table */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">All Lab Values</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Test</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {labValues.map((lab) => (
                    <tr key={lab.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {lab.test_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {lab.value} {lab.unit}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {lab.test_category}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          lab.is_abnormal 
                            ? 'bg-red-100 text-red-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {lab.is_abnormal ? 'Abnormal' : 'Normal'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {lab.test_date ? new Date(lab.test_date).toLocaleDateString() : 'Unknown'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabAnalytics;
