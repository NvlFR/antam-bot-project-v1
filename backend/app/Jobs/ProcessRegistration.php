<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use App\Models\Registration;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ProcessRegistration implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $registrationId;
    public $tries = 3; // Coba hingga 3 kali jika gagal (misal Worker Node.js sedang restart)
    public $backoff = 60; // Backoff time: 60 detik

    /**
     * Create a new job instance.
     */
    public function __construct($registrationId)
    {
        $this->registrationId = $registrationId;
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        // F2.4: Ambil data pendaftaran
        $registration = Registration::find($this->registrationId);
        
        if (!$registration) {
            Log::warning("Job Gagal: Registration ID #{$this->registrationId} tidak ditemukan.");
            return;
        }

        // F2.5: Buat Payload untuk Node.js Worker
        $payload = [
            'id' => $registration->id,
            'whatsapp_id' => $registration->whatsapp_id,
            'name' => $registration->name,
            'nik' => $registration->nik,
            'branch_code' => $registration->branch_code,
            'date_requested' => $registration->date_requested,
        ];
        
        $workerUrl = env('NODE_WORKER_URL') . '/start-automation';

        try {
            // F2.6: Kirim data ke Node.js Worker API
            $response = Http::timeout(10)->withHeaders([
                'Authorization' => 'Bearer ' . env('API_TOKEN'),
            ])->post($workerUrl, $payload);
            
            // Periksa apakah Node.js worker merespons sukses (200)
            if ($response->successful()) {
                Log::info("Job #{$registration->id} berhasil dikirim ke Node.js Worker.");
                // Update status di Laravel menjadi 'processing' (Node.js juga akan mengupdate, 
                // tapi ini untuk kepastian)
                $registration->update(['status' => 'processing', 'notes' => 'Telah dikirim ke worker.']);
            } else {
                // Node.js merespons error (misal 400 atau 500)
                Log::error("Job #{$registration->id} gagal dikirim ke Node.js Worker. Status: {$response->status()}. Pesan: {$response->body()}");
                $this->fail(new \Exception("Worker Node.js gagal merespons sukses: {$response->status()}"));
            }
            
        } catch (\Exception $e) {
            // Gagal koneksi ke Node.js Worker (misal server belum nyala)
            Log::error("Koneksi Gagal ke Node.js Worker: {$e->getMessage()}");
            // Melemparkan exception agar job dicoba ulang (retry)
            $this->release(60); 
            throw $e; 
        }
    }

    /**
     * Handle a job that failed to process.
     */
    public function failed(\Throwable $exception)
    {
        // Update status pendaftaran menjadi failed setelah semua tries habis
        $registration = Registration::find($this->registrationId);
        if ($registration) {
            $registration->update([
                'status' => 'failed',
                'notes' => 'Gagal total setelah ' . $this->tries . ' percobaan: ' . $exception->getMessage()
            ]);
            Log::critical("Job #{$registration->id} Gagal Total setelah percobaan berulang.");
        }
    }
}
