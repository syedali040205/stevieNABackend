"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var supabase_js_1 = require("@supabase/supabase-js");
var dotenv = __importStar(require("dotenv"));
var path = __importStar(require("path"));
// Load environment variables from api/.env
dotenv.config({ path: path.join(__dirname, '../api/.env') });
var supabaseUrl = process.env.SUPABASE_URL;
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('Connecting to Supabase...');
console.log('URL:', supabaseUrl);
var supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
function fixGeographyFilter() {
    return __awaiter(this, void 0, void 0, function () {
        var sql, _a, data, error, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log('\n🔧 Fixing geography filter in search_similar_categories function...\n');
                    sql = "\nDROP FUNCTION IF EXISTS search_similar_categories(vector(1536), text, integer);\n\nCREATE OR REPLACE FUNCTION search_similar_categories(\n  query_embedding vector(1536),\n  user_geography text DEFAULT NULL,\n  match_limit integer DEFAULT 10\n)\nRETURNS TABLE (\n  category_id uuid,\n  similarity_score float,\n  category_name text,\n  description text,\n  program_name text,\n  program_code text,\n  geographic_scope text[],\n  applicable_org_types text[],\n  applicable_org_sizes text[],\n  nomination_subject_type text,\n  achievement_focus text[]\n)\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  RETURN QUERY\n  SELECT \n    c.id as category_id,\n    1 - (ce.embedding <=> query_embedding) as similarity_score,\n    c.category_name,\n    c.description,\n    p.program_name,\n    p.program_code,\n    c.geographic_scope,\n    c.applicable_org_types,\n    c.applicable_org_sizes,\n    c.nomination_subject_type,\n    c.achievement_focus\n  FROM category_embeddings ce\n  JOIN stevie_categories c ON ce.category_id = c.id\n  JOIN stevie_programs p ON c.program_id = p.id\n  WHERE \n    (user_geography IS NULL \n     OR user_geography = 'worldwide' \n     OR user_geography = ANY(c.geographic_scope) \n     OR 'worldwide' = ANY(c.geographic_scope))\n  ORDER BY ce.embedding <=> query_embedding\n  LIMIT match_limit;\nEND;\n$$;\n\nGRANT EXECUTE ON FUNCTION search_similar_categories TO authenticated;\nGRANT EXECUTE ON FUNCTION search_similar_categories TO anon;\nGRANT EXECUTE ON FUNCTION search_similar_categories TO service_role;\n";
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, supabase.rpc('exec_sql', { sql: sql })];
                case 2:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        throw error;
                    }
                    console.log('✅ Geography filter fixed successfully!\n');
                    console.log('The function now correctly handles "worldwide" geography:');
                    console.log('  - NULL or "worldwide" → matches ALL categories');
                    console.log('  - Specific geography → matches that geography OR worldwide categories\n');
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _b.sent();
                    console.error('❌ Direct execution failed:', error_1.message);
                    console.log('\n📋 Please run this SQL manually in Supabase SQL Editor:\n');
                    console.log('-----------------------------------------------------------');
                    console.log(sql);
                    console.log('-----------------------------------------------------------\n');
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
fixGeographyFilter().catch(console.error);
