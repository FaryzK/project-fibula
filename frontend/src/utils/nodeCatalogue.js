// All available node types users can add to a workflow canvas
const NODE_CATALOGUE = [
  { nodeType: 'MANUAL_UPLOAD',       label: 'Manual Upload',           category: 'Trigger'    },
  { nodeType: 'WEBHOOK',             label: 'Webhook',                  category: 'Trigger'    },
  { nodeType: 'SPLITTING',           label: 'Document Splitting',       category: 'Config'     },
  { nodeType: 'CATEGORISATION',      label: 'Document Categorisation',  category: 'Config'     },
  { nodeType: 'IF',                  label: 'IF',                       category: 'Execution'  },
  { nodeType: 'SWITCH',              label: 'SWITCH',                   category: 'Execution'  },
  { nodeType: 'SET_VALUE',           label: 'Set Value',                category: 'Execution'  },
  { nodeType: 'EXTRACTOR',           label: 'Extractor',                category: 'Service'    },
  { nodeType: 'DATA_MAPPER',         label: 'Data Mapper',              category: 'Service'    },
  { nodeType: 'RECONCILIATION',      label: 'Reconciliation',           category: 'Service'    },
  { nodeType: 'DOCUMENT_FOLDER',     label: 'Document Folder',          category: 'Service'    },
  { nodeType: 'HTTP',                label: 'HTTP',                     category: 'Output'     },
];

export default NODE_CATALOGUE;
