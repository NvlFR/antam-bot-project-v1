<?php

// backend/app/Http/Middleware/ApiTokenCheck.php

namespace App\Http\Middleware; // <-- HARUS ADA DAN BENAR

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ApiTokenCheck
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // 1. Ambil token dari header Authorization (Bearer token)
        $token = str_replace('Bearer ', '', $request->header('Authorization', ''));

        // 2. Ambil token dari konfigurasi services
        $expectedToken = config('services.api.token'); // <-- MEMBACA DARI services.php

        if (!$expectedToken) {
        $expectedToken = env('API_TOKEN'); 
        }
        
        // 2. Cek apakah token sama dengan yang ada di config/services.php
        if ($token !== config('services.api.token')) {
            return response()->json(['message' => 'Unauthorized: Invalid API Token'], 401);
        }

        return $next($request);
    }
}