<?php

// backend/app/Http/Controllers/ApiController.php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Registration;
use App\Jobs\ProcessRegistration; // Import Job yang baru
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class ApiController extends Controller
{
    // F2.3: Menerima Pendaftaran dari WA Bot dan memasukkannya ke Queue
    public function queueRegistration(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'whatsapp_id' => 'required|string|max:15',
            'name' => 'nullable|string|max:255',
            'nik' => 'required|string|size:16',
            'branch_code' => 'required|string|max:20',
            'date_requested' => 'required|date_format:Y-m-d',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        try {
            // 1. Simpan data ke database dengan status 'pending'
            $registration = Registration::create($request->all());

            // 2. Kirim ke Queue untuk diproses oleh Node.js Worker
            ProcessRegistration::dispatch($registration->id);

            return response()->json([
                'message' => 'Pendaftaran berhasil diantrikan.',
                'registration_id' => $registration->id
            ], 201);

        } catch (\Exception $e) {
            Log::error("Gagal mengantrikan registrasi: " . $e->getMessage());
            return response()->json(['message' => 'Terjadi kesalahan server.'], 500);
        }
    }
    
    // F3.5: Menerima Hasil Otomatisasi dari Node.js Worker
    public function updateResult(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'registration_id' => 'required|exists:registrations,id',
            'status' => 'required|in:success,failed',
            'queue_number' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        $registration = Registration::find($request->registration_id);
        
        // 1. Update status dan hasil
        $registration->update([
            'status' => $request->status,
            'queue_number' => $request->queue_number,
            'notes' => $request->notes,
        ]);
        
        // 2. Kirim notifikasi ke WA Bot (Phase 6)
        // SendWaNotification::dispatch($registration->id); // Akan diimplementasikan nanti
        
        return response()->json(['message' => 'Status pendaftaran berhasil diperbarui.'], 200);
    }
    
    // Status Check Endpoint
    public function statusCheck()
    {
        return response()->json(['status' => 'API running', 'time' => now()]);
    }
}
