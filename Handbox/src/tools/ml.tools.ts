/**
 * ML (Machine Learning) 도구 노드 정의
 * 분류, 클러스터링, 회귀, 특성 추출 등 Python 기반 ML 작업
 */
import { invoke } from '@tauri-apps/api/tauri'
import type { NodeDefinition } from '../registry/NodeDefinition'

export const MlClassifyDefinition: NodeDefinition = {
  type: 'ml.classify',
  category: 'ai',
  meta: {
    label: 'ML 분류',
    description: '데이터를 분류합니다. 텍스트, 숫자 데이터 지원. sklearn 기반.',
    icon: 'Category',
    color: '#14b8a6',
    tags: ['ml', 'classify', 'classification', 'sklearn', '분류', '머신러닝'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '분류할 데이터 (배열)' },
      { name: 'labels', type: 'json', required: false, description: '학습용 레이블 (지도학습)' },
      { name: 'model', type: 'json', required: false, description: '사전 학습된 모델' },
    ],
    outputs: [
      { name: 'predictions', type: 'json', required: true, description: '분류 결과' },
      { name: 'probabilities', type: 'json', required: false, description: '클래스별 확률' },
      { name: 'model', type: 'json', required: false, description: '학습된 모델 (재사용용)' },
      { name: 'metrics', type: 'json', required: false, description: '성능 지표' },
    ],
  },
  configSchema: [
    { key: 'algorithm', label: '알고리즘', type: 'select', default: 'random_forest',
      options: [
        { label: 'Random Forest', value: 'random_forest' },
        { label: 'Gradient Boosting', value: 'gradient_boosting' },
        { label: 'SVM', value: 'svm' },
        { label: 'Logistic Regression', value: 'logistic_regression' },
        { label: 'KNN', value: 'knn' },
        { label: 'Naive Bayes', value: 'naive_bayes' },
        { label: 'Neural Network (MLP)', value: 'mlp' },
      ] },
    { key: 'mode', label: '모드', type: 'select', default: 'train_predict',
      options: [
        { label: '학습 + 예측', value: 'train_predict' },
        { label: '학습만', value: 'train' },
        { label: '예측만 (모델 필요)', value: 'predict' },
        { label: '교차 검증', value: 'cross_validate' },
      ] },
    { key: 'test_size', label: '테스트 비율', type: 'slider', min: 0.1, max: 0.5, step: 0.05, default: 0.2 },
    { key: 'n_estimators', label: '추정기 수 (앙상블)', type: 'number', default: 100 },
    { key: 'max_depth', label: '최대 깊이', type: 'number', default: 10 },
    { key: 'feature_columns', label: '특성 컬럼', type: 'text',
      description: '쉼표로 구분. 비워두면 전체 사용' },
    { key: 'target_column', label: '타겟 컬럼', type: 'text', required: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const code = `
import json
import sys
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.svm import SVC
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
import numpy as np
import pandas as pd

data = json.loads('''${JSON.stringify(input.data)}''')
df = pd.DataFrame(data)

feature_cols = '${config.feature_columns}'.split(',') if '${config.feature_columns}' else [c for c in df.columns if c != '${config.target_column}']
feature_cols = [c.strip() for c in feature_cols if c.strip() in df.columns]

X = df[feature_cols].values
y = df['${config.target_column}'].values if '${config.target_column}' in df.columns else None

algorithms = {
    'random_forest': RandomForestClassifier(n_estimators=${config.n_estimators || 100}, max_depth=${config.max_depth || 10}),
    'gradient_boosting': GradientBoostingClassifier(n_estimators=${config.n_estimators || 100}, max_depth=${config.max_depth || 5}),
    'svm': SVC(probability=True),
    'logistic_regression': LogisticRegression(max_iter=1000),
    'knn': KNeighborsClassifier(),
    'naive_bayes': GaussianNB(),
    'mlp': MLPClassifier(max_iter=500)
}

clf = algorithms.get('${config.algorithm}', algorithms['random_forest'])

if '${config.mode}' == 'cross_validate':
    scores = cross_val_score(clf, X, y, cv=5)
    result = {'cross_val_scores': scores.tolist(), 'mean_score': scores.mean(), 'std_score': scores.std()}
else:
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=${config.test_size || 0.2})
    clf.fit(X_train, y_train)
    predictions = clf.predict(X_test)
    probabilities = clf.predict_proba(X_test).tolist() if hasattr(clf, 'predict_proba') else None

    metrics = {
        'accuracy': accuracy_score(y_test, predictions),
        'precision': precision_score(y_test, predictions, average='weighted', zero_division=0),
        'recall': recall_score(y_test, predictions, average='weighted', zero_division=0),
        'f1': f1_score(y_test, predictions, average='weighted', zero_division=0)
    }

    result = {
        'predictions': predictions.tolist(),
        'probabilities': probabilities,
        'metrics': metrics,
        'feature_importance': clf.feature_importances_.tolist() if hasattr(clf, 'feature_importances_') else None
    }

print(json.dumps(result))
`
      const result = await invoke('tool_code_eval', {
        code,
        language: 'python',
        timeoutMs: 60000,
        inputData: null,
      }) as any

      const parsed = JSON.parse(result.stdout || '{}')
      return {
        predictions: parsed.predictions || [],
        probabilities: parsed.probabilities,
        model: { algorithm: config.algorithm, trained: true },
        metrics: parsed.metrics || parsed,
      }
    },
  },
  requirements: { scriptRuntime: 'python3' },
}

export const MlClusterDefinition: NodeDefinition = {
  type: 'ml.cluster',
  category: 'ai',
  meta: {
    label: 'ML 클러스터링',
    description: '데이터를 자동으로 그룹화합니다. K-Means, DBSCAN, 계층적 클러스터링.',
    icon: 'BubbleChart',
    color: '#14b8a6',
    tags: ['ml', 'cluster', 'clustering', 'kmeans', 'dbscan', '클러스터링', '군집'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '클러스터링할 데이터' },
    ],
    outputs: [
      { name: 'clusters', type: 'json', required: true, description: '클러스터 할당' },
      { name: 'centers', type: 'json', required: false, description: '클러스터 중심' },
      { name: 'metrics', type: 'json', required: false, description: '클러스터링 품질 지표' },
      { name: 'visualization', type: 'json', required: false, description: '시각화 데이터' },
    ],
  },
  configSchema: [
    { key: 'algorithm', label: '알고리즘', type: 'select', default: 'kmeans',
      options: [
        { label: 'K-Means', value: 'kmeans' },
        { label: 'DBSCAN', value: 'dbscan' },
        { label: '계층적 (Agglomerative)', value: 'hierarchical' },
        { label: 'Mean Shift', value: 'meanshift' },
        { label: 'Spectral', value: 'spectral' },
      ] },
    { key: 'n_clusters', label: '클러스터 수', type: 'number', default: 3,
      description: 'DBSCAN, Mean Shift는 자동 결정' },
    { key: 'eps', label: 'DBSCAN eps', type: 'number', default: 0.5,
      description: '이웃 거리 임계값' },
    { key: 'min_samples', label: 'DBSCAN min_samples', type: 'number', default: 5 },
    { key: 'feature_columns', label: '특성 컬럼', type: 'text',
      description: '쉼표로 구분. 비워두면 숫자 컬럼 전체' },
    { key: 'normalize', label: '정규화', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const code = `
import json
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering, MeanShift, SpectralClustering
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score, calinski_harabasz_score
import pandas as pd
import numpy as np

data = json.loads('''${JSON.stringify(input.data)}''')
df = pd.DataFrame(data)

feature_cols = '${config.feature_columns}'.split(',') if '${config.feature_columns}' else df.select_dtypes(include=[np.number]).columns.tolist()
feature_cols = [c.strip() for c in feature_cols if c.strip() in df.columns]

X = df[feature_cols].values

if ${config.normalize ? 'True' : 'False'}:
    scaler = StandardScaler()
    X = scaler.fit_transform(X)

algorithms = {
    'kmeans': KMeans(n_clusters=${config.n_clusters || 3}),
    'dbscan': DBSCAN(eps=${config.eps || 0.5}, min_samples=${config.min_samples || 5}),
    'hierarchical': AgglomerativeClustering(n_clusters=${config.n_clusters || 3}),
    'meanshift': MeanShift(),
    'spectral': SpectralClustering(n_clusters=${config.n_clusters || 3})
}

clusterer = algorithms.get('${config.algorithm}', algorithms['kmeans'])
labels = clusterer.fit_predict(X)

unique_labels = set(labels)
n_clusters = len(unique_labels) - (1 if -1 in unique_labels else 0)

metrics = {}
if n_clusters > 1 and len(set(labels)) > 1:
    valid_mask = labels != -1
    if valid_mask.sum() > 1:
        metrics['silhouette'] = silhouette_score(X[valid_mask], labels[valid_mask])
        metrics['calinski_harabasz'] = calinski_harabasz_score(X[valid_mask], labels[valid_mask])

centers = None
if hasattr(clusterer, 'cluster_centers_'):
    centers = clusterer.cluster_centers_.tolist()

result = {
    'labels': labels.tolist(),
    'n_clusters': n_clusters,
    'centers': centers,
    'metrics': metrics,
    'cluster_sizes': {int(l): int((labels == l).sum()) for l in unique_labels}
}

print(json.dumps(result))
`
      const result = await invoke('tool_code_eval', {
        code,
        language: 'python',
        timeoutMs: 60000,
        inputData: null,
      }) as any

      const parsed = JSON.parse(result.stdout || '{}')
      return {
        clusters: parsed.labels || [],
        centers: parsed.centers,
        metrics: { ...parsed.metrics, n_clusters: parsed.n_clusters, sizes: parsed.cluster_sizes },
        visualization: { type: '2d_scatter', labels: parsed.labels },
      }
    },
  },
  requirements: { scriptRuntime: 'python3' },
}

export const MlRegressionDefinition: NodeDefinition = {
  type: 'ml.regression',
  category: 'ai',
  meta: {
    label: 'ML 회귀',
    description: '연속값을 예측합니다. 선형, 다항식, 앙상블 회귀.',
    icon: 'TrendingUp',
    color: '#14b8a6',
    tags: ['ml', 'regression', 'predict', 'linear', '회귀', '예측'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '학습/예측 데이터' },
      { name: 'model', type: 'json', required: false, description: '사전 학습 모델' },
    ],
    outputs: [
      { name: 'predictions', type: 'json', required: true, description: '예측값' },
      { name: 'model', type: 'json', required: false, description: '학습된 모델' },
      { name: 'metrics', type: 'json', required: false, description: 'R2, MSE 등 지표' },
      { name: 'coefficients', type: 'json', required: false, description: '회귀 계수' },
    ],
  },
  configSchema: [
    { key: 'algorithm', label: '알고리즘', type: 'select', default: 'linear',
      options: [
        { label: '선형 회귀', value: 'linear' },
        { label: 'Ridge', value: 'ridge' },
        { label: 'Lasso', value: 'lasso' },
        { label: 'ElasticNet', value: 'elasticnet' },
        { label: 'Random Forest', value: 'random_forest' },
        { label: 'Gradient Boosting', value: 'gradient_boosting' },
        { label: 'SVR', value: 'svr' },
      ] },
    { key: 'target_column', label: '타겟 컬럼', type: 'text', required: true },
    { key: 'feature_columns', label: '특성 컬럼', type: 'text' },
    { key: 'test_size', label: '테스트 비율', type: 'slider', min: 0.1, max: 0.5, step: 0.05, default: 0.2 },
    { key: 'polynomial_degree', label: '다항식 차수', type: 'number', default: 1,
      description: '2 이상이면 다항식 특성 생성' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const code = `
import json
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression, Ridge, Lasso, ElasticNet
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.svm import SVR
from sklearn.preprocessing import PolynomialFeatures
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error
import pandas as pd
import numpy as np

data = json.loads('''${JSON.stringify(input.data)}''')
df = pd.DataFrame(data)

feature_cols = '${config.feature_columns}'.split(',') if '${config.feature_columns}' else [c for c in df.columns if c != '${config.target_column}']
feature_cols = [c.strip() for c in feature_cols if c.strip() in df.columns]

X = df[feature_cols].values
y = df['${config.target_column}'].values

poly_degree = ${config.polynomial_degree || 1}
if poly_degree > 1:
    poly = PolynomialFeatures(degree=poly_degree)
    X = poly.fit_transform(X)

algorithms = {
    'linear': LinearRegression(),
    'ridge': Ridge(),
    'lasso': Lasso(),
    'elasticnet': ElasticNet(),
    'random_forest': RandomForestRegressor(n_estimators=100),
    'gradient_boosting': GradientBoostingRegressor(n_estimators=100),
    'svr': SVR()
}

reg = algorithms.get('${config.algorithm}', algorithms['linear'])

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=${config.test_size || 0.2})
reg.fit(X_train, y_train)

predictions = reg.predict(X_test)

metrics = {
    'r2': r2_score(y_test, predictions),
    'mse': mean_squared_error(y_test, predictions),
    'rmse': np.sqrt(mean_squared_error(y_test, predictions)),
    'mae': mean_absolute_error(y_test, predictions)
}

coefficients = None
if hasattr(reg, 'coef_'):
    coefficients = reg.coef_.tolist() if hasattr(reg.coef_, 'tolist') else list(reg.coef_)

result = {
    'predictions': predictions.tolist(),
    'metrics': metrics,
    'coefficients': coefficients,
    'intercept': float(reg.intercept_) if hasattr(reg, 'intercept_') else None
}

print(json.dumps(result))
`
      const result = await invoke('tool_code_eval', {
        code,
        language: 'python',
        timeoutMs: 60000,
        inputData: null,
      }) as any

      const parsed = JSON.parse(result.stdout || '{}')
      return {
        predictions: parsed.predictions || [],
        model: { algorithm: config.algorithm, trained: true },
        metrics: parsed.metrics,
        coefficients: { coef: parsed.coefficients, intercept: parsed.intercept },
      }
    },
  },
  requirements: { scriptRuntime: 'python3' },
}

export const MlFeatureEngineeringDefinition: NodeDefinition = {
  type: 'ml.feature-engineering',
  category: 'ai',
  meta: {
    label: '특성 엔지니어링',
    description: '데이터 전처리, 특성 선택, 변환을 수행합니다.',
    icon: 'Engineering',
    color: '#14b8a6',
    tags: ['ml', 'feature', 'preprocessing', 'transform', '특성', '전처리'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '원본 데이터' },
    ],
    outputs: [
      { name: 'transformed_data', type: 'json', required: true, description: '변환된 데이터' },
      { name: 'feature_info', type: 'json', required: false, description: '특성 정보' },
      { name: 'stats', type: 'json', required: false, description: '통계 정보' },
    ],
  },
  configSchema: [
    { key: 'operations', label: '수행할 작업', type: 'select', default: 'standard_scale',
      options: [
        { label: '표준화 (StandardScaler)', value: 'standard_scale' },
        { label: '정규화 (MinMaxScaler)', value: 'minmax_scale' },
        { label: '로그 변환', value: 'log_transform' },
        { label: '원핫 인코딩', value: 'onehot' },
        { label: '레이블 인코딩', value: 'label_encode' },
        { label: '결측치 처리', value: 'impute' },
        { label: '이상치 제거', value: 'outlier_remove' },
        { label: 'PCA 차원 축소', value: 'pca' },
        { label: '특성 선택', value: 'feature_select' },
      ] },
    { key: 'columns', label: '대상 컬럼', type: 'text',
      description: '쉼표로 구분. 비워두면 자동 선택' },
    { key: 'n_components', label: 'PCA 컴포넌트 수', type: 'number', default: 2 },
    { key: 'k_best', label: '선택할 특성 수 (k-best)', type: 'number', default: 10 },
    { key: 'impute_strategy', label: '결측치 대체 전략', type: 'select', default: 'mean',
      options: [
        { label: '평균', value: 'mean' },
        { label: '중앙값', value: 'median' },
        { label: '최빈값', value: 'most_frequent' },
        { label: '상수', value: 'constant' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const code = `
import json
from sklearn.preprocessing import StandardScaler, MinMaxScaler, LabelEncoder, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.decomposition import PCA
from sklearn.feature_selection import SelectKBest, f_classif
import pandas as pd
import numpy as np

data = json.loads('''${JSON.stringify(input.data)}''')
df = pd.DataFrame(data)

columns = '${config.columns}'.split(',') if '${config.columns}' else None
columns = [c.strip() for c in columns if c.strip() in df.columns] if columns else None

operation = '${config.operations}'
feature_info = {'operation': operation, 'original_shape': df.shape}

if operation == 'standard_scale':
    cols = columns or df.select_dtypes(include=[np.number]).columns.tolist()
    scaler = StandardScaler()
    df[cols] = scaler.fit_transform(df[cols])
    feature_info['scaled_columns'] = cols

elif operation == 'minmax_scale':
    cols = columns or df.select_dtypes(include=[np.number]).columns.tolist()
    scaler = MinMaxScaler()
    df[cols] = scaler.fit_transform(df[cols])
    feature_info['scaled_columns'] = cols

elif operation == 'log_transform':
    cols = columns or df.select_dtypes(include=[np.number]).columns.tolist()
    for col in cols:
        df[col] = np.log1p(df[col].clip(lower=0))
    feature_info['transformed_columns'] = cols

elif operation == 'onehot':
    cols = columns or df.select_dtypes(include=['object', 'category']).columns.tolist()
    df = pd.get_dummies(df, columns=cols)
    feature_info['encoded_columns'] = cols

elif operation == 'label_encode':
    cols = columns or df.select_dtypes(include=['object', 'category']).columns.tolist()
    le = LabelEncoder()
    for col in cols:
        df[col] = le.fit_transform(df[col].astype(str))
    feature_info['encoded_columns'] = cols

elif operation == 'impute':
    imputer = SimpleImputer(strategy='${config.impute_strategy}')
    cols = columns or df.select_dtypes(include=[np.number]).columns.tolist()
    df[cols] = imputer.fit_transform(df[cols])
    feature_info['imputed_columns'] = cols

elif operation == 'pca':
    cols = columns or df.select_dtypes(include=[np.number]).columns.tolist()
    pca = PCA(n_components=${config.n_components || 2})
    transformed = pca.fit_transform(df[cols])
    for i in range(transformed.shape[1]):
        df[f'PC{i+1}'] = transformed[:, i]
    feature_info['variance_explained'] = pca.explained_variance_ratio_.tolist()

stats = {
    'final_shape': df.shape,
    'columns': df.columns.tolist(),
    'dtypes': {col: str(dtype) for col, dtype in df.dtypes.items()}
}

result = {
    'data': df.to_dict(orient='records'),
    'feature_info': feature_info,
    'stats': stats
}

print(json.dumps(result))
`
      const result = await invoke('tool_code_eval', {
        code,
        language: 'python',
        timeoutMs: 60000,
        inputData: null,
      }) as any

      const parsed = JSON.parse(result.stdout || '{}')
      return {
        transformed_data: parsed.data || [],
        feature_info: parsed.feature_info,
        stats: parsed.stats,
      }
    },
  },
  requirements: { scriptRuntime: 'python3' },
}

export const ML_DEFINITIONS: NodeDefinition[] = [
  MlClassifyDefinition,
  MlClusterDefinition,
  MlRegressionDefinition,
  MlFeatureEngineeringDefinition,
]
