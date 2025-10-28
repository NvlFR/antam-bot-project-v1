<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ApiController;

// Rute yang TIDAK memerlukan token API (Health Check)
Route::get('/status', [ApiController::class, 'statusCheck']);

// Rute yang MEMERLUKAN token API (Middleware 'api_token_check')
Route::middleware('api_token_check')->group(function () {
    // Rute untuk menerima job dari Worker Node.js
    Route::post('/update-result', [ApiController::class, 'updateResult']);
    
    // Rute yang akan dipanggil oleh WA Bot untuk mengantrikan pendaftaran
    Route::post('/queue-registration', [ApiController::class, 'queueRegistration']);
});

// Anda mungkin memiliki rute default dari Laravel seperti ini, biarkan saja:
Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return $request->user();
});
