<?php
/**
 * Plugin Name: WPForms Options Quiz Score
 * Description: Adiciona um sistema avançado de pontuação e avaliação automática para formulários WPForms, permitindo criar questionários interativos com feedback instantâneo
 * Version: 1.1.4
 * Author: Manoel de Souza
 * Author URI: https://optionstech.com.br
 * Plugin URI: https://optionstech.com.br
 * 
 * 🏢 Desenvolvido por Options Tech
 * 👨‍💻 Desenvolvedor: Manoel de Souza
 * 🔗 LinkedIn: https://www.linkedin.com/in/manoel-sz/
 * 🐱 GitHub: https://github.com/Manoel-souz
 */

if (!defined('ABSPATH')) exit;

class WPForms_Quiz_Score {
    private $table_name;
    
    public function __construct() {
        global $wpdb;
        $this->table_name = $wpdb->prefix . 'wpforms_quiz_answers';
        
        // Move o registro do hook para fora do construtor
        register_activation_hook(__FILE__, array($this, 'create_answers_table'));
        
        // Hooks existentes
        add_action('wpforms_loaded', array($this, 'init'));
        
        // ADICIONAR ESTE HOOK para scripts
        add_action('admin_enqueue_scripts', array($this, 'enqueue_scripts')); // Para admin
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts')); // Para front-end
        
        // Hooks existentes
        add_filter('wpforms_builder_settings_sections', array($this, 'add_settings_section'), 20, 2);
        add_filter('wpforms_form_settings_panel_content', array($this, 'add_settings_content'), 20);
        add_action('wp_ajax_save_quiz_settings', array($this, 'save_quiz_settings'));
        add_action('wp_ajax_get_quiz_answers', array($this, 'get_quiz_answers'));
        add_action('wp_ajax_nopriv_get_quiz_answers', array($this, 'get_quiz_answers'));
        
        // Hooks para adicionar a opção de cálculo
        add_filter('wpforms_field_options_advanced_number', array($this, 'add_calculate_field_settings'), 10, 1);
        add_filter('wpforms_field_properties', array($this, 'add_calculate_field_option'), 10, 2);
        
        // Adiciona seção de pontuação e shortcode
        add_filter('wpforms_form_settings_panel_content', array($this, 'add_score_settings'), 10);
        add_shortcode('wpforms_quiz_score', array($this, 'score_shortcode'));
        
        // Adiciona action para salvar campo de pontuação e respostas
        add_action('wp_ajax_save_quiz_score_field', array($this, 'save_quiz_score_field'));
        add_action('wp_ajax_nopriv_save_quiz_score_field', array($this, 'save_quiz_score_field'));
        
        // Adiciona tipos de campos
        add_filter('wpforms_field_types', array($this, 'add_field_types'));
        
        // Adiciona tipos de respostas
        add_filter('wpforms_answer_types', array($this, 'add_answer_types')); 
        
        // Add smart tag
        add_filter('wpforms_smart_tags', array($this, 'add_smart_tags'));
    }

    public function init() {
        // Inicializa o plugin quando WPForms estiver carregado
    }

    public function enqueue_scripts() {
        // Enfileira o jQuery primeiro
        wp_enqueue_script('jquery');
        
        // Enfileira nosso script
        wp_enqueue_script(
            'wpforms-quiz-score',
            plugins_url('js/quiz-score.js', __FILE__),
            array('jquery'),
            '1.0.' . time(), // Força recarregamento do cache
            true
        );

        // Tenta obter o form_id de várias maneiras
        $form_id = 0;
        
        // Se estiver na página de edição do formulário
        if (isset($_GET['form_id'])) {
            $form_id = absint($_GET['form_id']);
        }
        // Busca o ID do formulário no HTML
        else {
            // Busca o formulário no DOM usando jQuery
            $html = file_get_contents('php://input');
            if (preg_match('/wpforms-form-(\d+)/', $html, $matches)) {
                $form_id = absint($matches[1]);
            }
            
            // Se não encontrou no DOM, tenta outras formas
            if (!$form_id) {
                $forms = get_posts(array(
                    'post_type' => 'wpforms',
                    'posts_per_page' => -1
                ));

                foreach ($forms as $form) {
                    if (strpos($html, 'wpforms-form-' . $form->ID) !== false) {
                        $form_id = $form->ID;
                        break;
                    }
                }
            }
        }

        wp_localize_script(
            'wpforms-quiz-score',
            'wpformsQuizData',
            array(
                'ajaxurl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('wpforms-quiz'),
                'formId' => $form_id,
                'debug' => true
            )
        );

        // Enfileira CSS
        wp_enqueue_style(
            'wpforms-quiz-score',
            plugins_url('css/quiz-score.css', __FILE__),
            array(),
            '1.0.' . time()
        );
    }

    public function add_settings_section($sections, $form_data) {
        $sections['quiz_score'] = 'Opções de Pontuação';
        return $sections;
    }

    public function add_settings_content($instance) {
        global $wpdb;
        
        // Obtém o ID do formulário atual
        $current_form_id = isset($_GET['form_id']) ? absint($_GET['form_id']) : 0;
        
        if (!$current_form_id) {
            echo '<p>ID do formulário não encontrado.</p>';
            return;
        }

        // Busca respostas salvas
        $saved_answers = $wpdb->get_results($wpdb->prepare(
            "SELECT field_id, correct_answer, second_answer 
             FROM {$wpdb->prefix}wpforms_quiz_answers 
             WHERE form_id = %d",
            $current_form_id
        ), OBJECT_K);

        $form = wpforms()->form->get($current_form_id);
        if (empty($form)) {
            echo '<p>Formulário não encontrado.</p>';
            return;
        }

        $form_data = json_decode($form->post_content, true);

        echo '<div class="wpforms-panel-content-section wpforms-panel-content-section-quiz_score">';
        echo '<div class="wpforms-panel-content-section-title">';
        echo 'Configurações de Pontuação';
        echo '</div>';

        if (!empty($form_data['fields'])) {
            $has_quiz_fields = false;
            
            echo '<div class="quiz-form-section">';
            
            // Filtra apenas campos do tipo radio e select
            foreach ($form_data['fields'] as $field) {
                if (in_array($field['type'], ['radio', 'select'])) {
                    $has_quiz_fields = true;
                    $field_id = $field['id'];
                    
                    // Obtém a resposta salva para este campo
                    $saved_answer = isset($saved_answers[$field_id]) ? 
                                  $saved_answers[$field_id]->correct_answer : '';
                    $saved_second_answer = isset($saved_answers[$field_id]) ? 
                                  $saved_answers[$field_id]->second_answer : '';
                    
                    echo '<div class="quiz-question-settings">';
                    echo '<div class="quiz-question-info">';
                    echo '<p><strong>Pergunta:</strong> ' . esc_html($field['label']) . '</p>';
                    echo '<span>Tipo: ' . ucfirst($field['type']) . ' | ID: ' . $field['id'] . '</span>';
                    echo '</div>';
                    
                    // Primeira resposta (valor total)
                    echo '<label>Selecione a resposta principal (valor total):</label>';
                    echo '<select name="quiz_correct_answer_' . $field_id . '" 
                             data-form-id="' . $current_form_id . '" 
                             data-field-id="' . $field_id . '" 
                             class="quiz-answer-select primary-answer">';
                    echo '<option value="">Selecione uma resposta</option>';
                    
                    if (!empty($field['choices'])) {
                        foreach ($field['choices'] as $choice) {
                            // Compara com a resposta salva
                            $selected = ($saved_answer === $choice['label']) ? 'selected="selected"' : '';
                            echo '<option value="' . esc_attr($choice['label']) . '" ' . $selected . '>';
                            echo esc_html($choice['label']);
                            echo '</option>';
                        }
                    }
                    
                    echo '</select>';

                    // Segunda resposta (metade do valor)
                    echo '<label>Selecione a resposta secundária (metade do valor):</label>';
                    echo '<select name="quiz_second_answer_' . $field_id . '" 
                             data-form-id="' . $current_form_id . '" 
                             data-field-id="' . $field_id . '" 
                             class="quiz-answer-select secondary-answer">';
                    echo '<option value="">Selecione uma resposta</option>';
                    
                    if (!empty($field['choices'])) {
                        foreach ($field['choices'] as $choice) {
                            $selected = ($saved_second_answer === $choice['label']) ? 'selected="selected"' : '';
                            echo '<option value="' . esc_attr($choice['label']) . '" ' . $selected . '>';
                            echo esc_html($choice['label']);
                            echo '</option>';
                        }
                    }
                    echo '</select>';
                    
                    echo '</div>';
                    echo '<hr>';
                }
            }
            
            if (!$has_quiz_fields) {
                echo '<p>Este formulário não possui campos de múltipla escolha ou seleção.</p>';
            } else {
                echo '<div class="wpforms-setting-row quiz-save-button">';
                echo '<button class="wpforms-btn wpforms-btn-primary" id="save-quiz-settings">';
                echo 'Salvar Configurações</button>';
                echo '<span class="spinner"></span>';
                echo '</div>';
            }
            
            echo '</div>';
        }
        
        echo '</div>';
    }

    private function get_saved_answer($form_id, $field_id) {
        global $wpdb;
        
        $result = $wpdb->get_var($wpdb->prepare(
            "SELECT answer FROM {$wpdb->prefix}wpforms_quiz_answers 
             WHERE form_id = %d AND field_id = %d",
            $form_id,
            $field_id
        ));
        
        return $result;
    }

    public function create_answers_table() {
        global $wpdb;
        try {
            $charset_collate = $wpdb->get_charset_collate();
            $table_name = $wpdb->prefix . 'wpforms_quiz_answers';
            
            // SQL para criar a tabela com a nova coluna answer_type e field_type
            $sql = "CREATE TABLE IF NOT EXISTS $table_name (
                id bigint(20) NOT NULL AUTO_INCREMENT,
                form_id bigint(20) NOT NULL,
                field_id bigint(20) NOT NULL,
                correct_answer text NOT NULL,
                second_answer text DEFAULT NULL,
                answer_type varchar(50) DEFAULT NULL,
                field_type varchar(50) DEFAULT NULL,
                created_at datetime DEFAULT CURRENT_TIMESTAMP,
                updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY  (id),
                UNIQUE KEY form_field (form_id,field_id)
            ) $charset_collate;";
            
            require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
            dbDelta($sql);
            
            // Check if second_answer column exists
            $column_exists = $wpdb->get_results("SHOW COLUMNS FROM $table_name LIKE 'second_answer'");
            if (empty($column_exists)) {
                $wpdb->query("ALTER TABLE $table_name ADD COLUMN second_answer text DEFAULT NULL AFTER correct_answer");
            }
            
        } catch (Exception $e) {
        }
    }

    public function save_quiz_settings() {
        // Verifica o nonce
        if (!check_ajax_referer('wpforms-quiz', 'nonce', false)) {
            wp_send_json_error(array('message' => 'Nonce inválido. Por favor, recarregue a página e tente novamente.'));
            return;
        }

        $form_id = isset($_POST['form_id']) ? absint($_POST['form_id']) : 0;
        $settings = isset($_POST['settings']) ? $_POST['settings'] : array();

        if (!$form_id || empty($settings)) {
            wp_send_json_error(array('message' => 'Dados inválidos'));
            return;
        }

        global $wpdb;
        $table_name = $wpdb->prefix . 'wpforms_quiz_answers';
        $success = true;

        try {
            // Inicia transação
            $wpdb->query('START TRANSACTION');

            // Processa cada configuração
            foreach ($settings as $key => $data) {
                if (!isset($data['form_id']) || !isset($data['field_id']) || !isset($data['type'])) {
                    continue;
                }

                $field_data = array(
                    'form_id' => absint($data['form_id']),
                    'field_id' => absint($data['field_id']),
                    'answer_type' => sanitize_text_field($data['type'])
                );

                // Adiciona campos específicos baseado no tipo
                if ($data['type'] === 'quiz_answer') {
                    $field_data['correct_answer'] = isset($data['primary_answer']) ? 
                        sanitize_text_field($data['primary_answer']) : '';
                    $field_data['second_answer'] = isset($data['secondary_answer']) ? 
                        sanitize_text_field($data['secondary_answer']) : '';
                } else {
                    $field_data['correct_answer'] = '';
                    $field_data['second_answer'] = '';
                }

                // Verifica se o registro já existe
                $exists = $wpdb->get_var($wpdb->prepare(
                    "SELECT id FROM $table_name WHERE form_id = %d AND field_id = %d",
                    $field_data['form_id'],
                    $field_data['field_id']
                ));

                if ($exists) {
                    // Atualiza o registro existente
                    $result = $wpdb->update(
                        $table_name,
                        $field_data,
                        array(
                            'form_id' => $field_data['form_id'],
                            'field_id' => $field_data['field_id']
                        ),
                        array(
                            '%d', // form_id
                            '%d', // field_id
                            '%s', // answer_type
                            '%s', // correct_answer
                            '%s'  // second_answer
                        ),
                        array('%d', '%d')
                    );
                } else {
                    // Insere novo registro
                    $result = $wpdb->insert(
                        $table_name,
                        $field_data,
                        array(
                            '%d', // form_id
                            '%d', // field_id
                            '%s', // answer_type
                            '%s', // correct_answer
                            '%s'  // second_answer
                        )
                    );
                }

                if ($result === false) {
                    $success = false;
                    break;
                }
            }

            if ($success) {
                $wpdb->query('COMMIT');
                wp_send_json_success(array('message' => 'Configurações salvas com sucesso'));
            } else {
                $wpdb->query('ROLLBACK');
                wp_send_json_error(array('message' => 'Erro ao salvar configurações'));
            }

        } catch (Exception $e) {
            $wpdb->query('ROLLBACK');
            wp_send_json_error(array('message' => 'Erro ao salvar configurações'));
        }
    }

    private function add_settings_script() {
        ?>
        <script type="text/javascript">
        jQuery(document).ready(function($) {
            $('#save-quiz-settings').on('click', function(e) {
                e.preventDefault();
                console.log('🎯 Iniciando salvamento...');
                
                // Coleta as respostas
                var settings = {};
                $('.quiz-question-settings select').each(function() {
                    var $select = $(this);
                    var form_id = $select.data('form-id');
                    var field_id = $select.data('field-id');
                    var answer = $select.val();
                    
                    if (answer && answer !== '') {
                        // Estrutura correta dos dados
                        var key = 'quiz_correct_answer_' + form_id + '_' + field_id;
                        settings[key] = {
                            form_id: form_id,
                            field_id: field_id,
                            primary_answer: answer
                        };
                        
                        console.log('Resposta coletada:', {
                            form_id: form_id,
                            field_id: field_id,
                            primary_answer: answer
                        });
                    }
                });
                
                // Debug
                console.log('Dados a serem enviados:', settings);
                
                // Se não houver respostas selecionadas
                if (Object.keys(settings).length === 0) {
                    alert('Por favor, selecione pelo menos uma resposta correta.');
                    return;
                }
                
                // Mostra loading
                var $button = $(this);
                var $spinner = $button.next('.spinner');
                $button.prop('disabled', true);
                $spinner.css('visibility', 'visible');
                
                // Envia para o servidor
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'save_quiz_settings',
                        nonce: '<?php echo wp_create_nonce("wpforms-builder"); ?>',
                        settings: settings
                    },
                    success: function(response) {
                        console.log('Resposta:', response);
                        if (response.success) {
                            alert('✅ ' + response.data.message);
                        } else {
                            alert('❌ ' + response.data.message);
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Erro:', error);
                        alert('Erro ao salvar configurações');
                    },
                    complete: function() {
                        $button.prop('disabled', false);
                        $spinner.css('visibility', 'hidden');
                    }
                });
            });
        });
        </script>
        <?php
    }

    public function get_form_data() {
        global $wpdb;
        
        $current_form_id = isset($_GET['form_id']) ? absint($_GET['form_id']) : 0;
        
        if (!$current_form_id) {
            return array();
        }
        
        $answers = $wpdb->get_results($wpdb->prepare(
            "SELECT field_id, correct_answer 
            FROM {$this->table_name} 
            WHERE form_id = %d",
            $current_form_id
        ));
        
        $form_data = array();
        
        foreach ($answers as $answer) {
            $form_data[$answer->field_id] = $answer->correct_answer;
        }
        
        return $form_data;
    }

    public function get_quiz_answers() {
        // Verifica o nonce
        if (!check_ajax_referer('wpforms-quiz', 'nonce', false)) {
            wp_send_json_error(array('message' => 'Erro de segurança'));
            return;
        }

        global $wpdb;
        
        $form_id = isset($_POST['form_id']) ? absint($_POST['form_id']) : 0;

        if (!$form_id) {
            wp_send_json_error(array('message' => 'Form ID inválido'));
            return;
        }

        // Busca todas as respostas corretas para o formulário
        $respostas = $wpdb->get_results($wpdb->prepare(
            "SELECT field_id, correct_answer, second_answer, answer_type 
            FROM {$this->table_name} 
            WHERE form_id = %d",
            $form_id
        ));

        if ($respostas === false) {
            wp_send_json_error(array('message' => 'Erro ao buscar respostas'));
            return;
        }

        // Formata as respostas para enviar ao JavaScript
        $respostas_formatadas = array();
        foreach ($respostas as $resposta) {
            $respostas_formatadas[$resposta->field_id] = array(
                'primary_answer' => $resposta->correct_answer,
                'secondary_answer' => $resposta->second_answer,
                'type' => $resposta->answer_type
            );
        }

        wp_send_json_success($respostas_formatadas);
    }

    // Adiciona a opção de cálculo no builder
    public function add_calculate_field_settings($options) {
        $options['calculate'] = array(
            'id'      => 'calculate',
            'name'    => 'calculate',
            'type'    => 'checkbox',
            'label'   => 'Campo de Cálculo',
            'tooltip' => 'Quando ativado, este campo mostrará automaticamente a nota final do quiz.',
            'class'   => 'wpforms-field-option-row-calculate'
        );
        
        return $options;
    }

    // Modifica o campo quando a opção de cálculo está ativada
    public function add_calculate_field_option($properties, $field) {
        if (!empty($field['calculate'])) {
            $properties['container']['class'][] = 'wpforms-field-hidden';
            $properties['inputs']['primary']['data']['calc-field'] = '1';
            $properties['inputs']['primary']['attr']['readonly'] = 'readonly';
            $properties['inputs']['primary']['class'][] = 'wpforms-calc-field';
        }
        return $properties;
    }

    // Adiciona o filtro para substituir a variável {quiz_score}
    public function process_smart_tags($content, $form_data, $fields = array(), $entry_id = 0) {
        // Original quiz score tag processing
        if (strpos($content, '{quiz_score}') !== false) {
            $content = str_replace('{quiz_score}', '<span class="quiz-score-display">0</span>', $content);
        }

        // Process new incorrect answers tag
        if (strpos($content, '{quiz_incorrect_answers}') !== false) {
            $content = str_replace(
                '{quiz_incorrect_answers}', 
                '<div class="quiz-incorrect-answers"></div>', 
                $content
            );
        }

        return $content;
    }

    public function add_score_settings($instance) {
        global $wpdb;
        
        echo '<div class="wpforms-panel-content-section wpforms-panel-content-section-quiz_score">';
        echo '<div class="wpforms-panel-content-section-title">';
        echo 'Opções de Pontuação';
        echo '</div>';
        
        // Busca o formulário atual
        $form_id = absint($_GET['form_id']);
        if (!$form_id) {
            echo '<p>Formulário não encontrado.</p>';
            echo '</div>';
            return;
        }
        
        // Busca os campos do formulário
        $form = wpforms()->form->get($form_id);
        if (empty($form)) {
            echo '<p>Formulário não encontrado.</p>';
            echo '</div>';
            return;
        }

        // Busca as configurações salvas no banco de dados
        $saved_settings = $wpdb->get_results($wpdb->prepare(
            "SELECT field_id, answer_type 
            FROM {$wpdb->prefix}wpforms_quiz_answers 
            WHERE form_id = %d AND (answer_type = 'score_field' OR answer_type = 'incorrect_answers_field')",
            $form_id
        ), OBJECT_K);

        // Extrai os IDs dos campos salvos
        $current_score_field = '';
        $current_incorrect_answers_field = '';
        foreach ($saved_settings as $field_id => $setting) {
            if ($setting->answer_type === 'score_field') {
                $current_score_field = $field_id;
            } elseif ($setting->answer_type === 'incorrect_answers_field') {
                $current_incorrect_answers_field = $field_id;
            }
        }
        
        $form_data = json_decode($form->post_content, true);
        $number_fields = array();
        $textarea_fields = array(); // Array para campos textarea
        
        // Filtra campos number e textarea
        if (!empty($form_data['fields'])) {
            foreach ($form_data['fields'] as $field) {
                if ($field['type'] === 'number') {
                    $number_fields[$field['id']] = array(
                        'label' => $field['label'],
                        'id' => $field['id']
                    );
                }
                // Adiciona campos textarea
                if ($field['type'] === 'textarea') {
                    $textarea_fields[$field['id']] = array(
                        'label' => $field['label'],
                        'id' => $field['id']
                    );
                }
            }
        }
        
        // Campo para selecionar onde mostrar a pontuação
        echo '<div class="wpforms-setting-row">';
        echo '<label class="wpforms-setting-label">Campo para Exibir Pontuação</label>';
        echo '<div class="wpforms-setting-field">';
        
        if (empty($number_fields)) {
            echo '<p class="description" style="color: #cc0000;">Nenhum campo numérico encontrado. Adicione um campo do tipo "Número" ao formulário.</p>';
        } else {
            echo '<div class="score-field-selection" style="display: flex; align-items: center; gap: 10px;">';
            echo '<select name="quiz_score_field" id="quiz_score_field" data-form-id="' . esc_attr($form_id) . '">';
            echo '<option value="">Selecione um campo</option>';
            
            foreach ($number_fields as $field) {
                $selected = ($current_score_field == $field['id']) ? 'selected' : '';
                echo sprintf(
                    '<option value="%d" %s>%s (ID: %d)</option>',
                    $field['id'],
                    $selected,
                    esc_html($field['label']),
                    $field['id']
                );
            }
            echo '</select>';
            
            echo '<span class="spinner" style="float: none; margin: 0 5px;"></span>';
            
            // Exibe o valor atual se existir
            if ($current_score_field) {
                echo '<div class="current-value" style="margin-left: 10px; padding: 5px; background: #f0f0f1; border-radius: 4px;">';
                echo '<strong>Campo atual:</strong> ID ' . esc_html($current_score_field);
                echo '</div>';
            }
            
            echo '</div>';
        }
        echo '</div>';
        echo '</div>';

        // Campo para selecionar onde mostrar as respostas incorretas
        echo '<div class="wpforms-setting-row">';
        echo '<label class="wpforms-setting-label">Campo para Exibir Respostas Incorretas</label>';
        echo '<div class="wpforms-setting-field">';
        
        if (empty($textarea_fields)) {
            echo '<p class="description" style="color: #cc0000;">Nenhum campo de texto longo encontrado. Adicione um campo do tipo "Texto Longo" ao formulário.</p>';
        } else {
            echo '<div class="incorrect-answers-field-selection" style="display: flex; align-items: center; gap: 10px;">';
            echo '<select name="quiz_incorrect_answers_field" id="quiz_incorrect_answers_field" data-form-id="' . esc_attr($form_id) . '">';
            echo '<option value="">Selecione um campo</option>';
            
            foreach ($textarea_fields as $field) {
                $selected = ($current_incorrect_answers_field == $field['id']) ? 'selected' : '';
                echo sprintf(
                    '<option value="%d" %s>%s (ID: %d)</option>',
                    $field['id'],
                    $selected,
                    esc_html($field['label']),
                    $field['id']
                );
            }
            echo '</select>';
            
            echo '<span class="spinner" style="float: none; margin: 0 5px;"></span>';
            
            // Exibe o valor atual se existir
            if ($current_incorrect_answers_field) {
                echo '<div class="current-value" style="margin-left: 10px; padding: 5px; background: #f0f0f1; border-radius: 4px;">';
                echo '<strong>Campo atual:</strong> ID ' . esc_html($current_incorrect_answers_field);
                echo '</div>';
            }
            
            echo '</div>';
            
            echo '<p class="description">Selecione o campo de texto longo onde as respostas incorretas serão exibidas automaticamente.</p>';
        }
        echo '</div>';
        echo '</div>';
        
        // Informações do shortcode
        echo '<div class="wpforms-setting-row">';
        echo '<label class="wpforms-setting-label">Shortcode da Pontuação</label>';
        echo '<div class="wpforms-setting-field">';
        echo '<div class="shortcode-container" style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 10px 0;">';
        echo '<p style="margin:0 0 10px 0;"><strong>Shortcode básico:</strong></p>';
        echo '<code style="display:block;padding:8px;background:#fff;border:1px solid #ddd;border-radius:3px">[wpforms_quiz_score form_id="' . $form_id . '"]</code>';
        echo '<p style="margin:10px 0 0 0;font-size:13px;color:#666;">💡 Copie e cole este shortcode em qualquer página ou post para exibir a pontuação do quiz.</p>';
        echo '</div>';
        echo '<div class="shortcode-examples" style="margin-top:15px;">';
        echo '<p style="margin:0 0 8px 0;"><strong>Exemplos de uso:</strong></p>';
        echo '<ul style="margin:0;padding-left:20px;color:#666;font-size:13px;">';
        echo '<li>Em posts: Cole o shortcode no editor</li>'; 
        echo '<li>Aqui no formulário: Selecione um elemento HTML e adicione: <code style="background:#f1f1f1;padding:2px 4px;">[wpforms_quiz_score form_id="' . $form_id . '"]</code></li>';
        echo '</ul>';
        echo '</div>';
        echo '</div>';
        echo '</div>';
        
        echo '</div>';
    }

    public function score_shortcode($atts) {
        $atts = shortcode_atts(array(
            'form_id' => 0
        ), $atts);
        
        if (empty($atts['form_id'])) {
            return '';
        }
        
        // Retorna um span que será atualizado via JavaScript
        return sprintf(
            '<span class="quiz-score-display" data-form-id="%d">0.0</span>',
            (int)$atts['form_id']
        );
    }

    public function save_quiz_score_field() {

        // Verifica o nonce
        if (!check_ajax_referer('wpforms-quiz', 'nonce', false)) {
            wp_send_json_error(array('message' => 'Erro de segurança'));
            return;
        }

        global $wpdb;
        
        $form_id = isset($_POST['form_id']) ? absint($_POST['form_id']) : 0;
        $field_id = isset($_POST['field_id']) ? absint($_POST['field_id']) : 0;
        
        if (!$form_id || !$field_id) {
            wp_send_json_error(array('message' => 'Dados inválidos'));
            return;
        }

        // Verifica se já existe um campo de pontuação
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$this->table_name} 
            WHERE form_id = %d AND answer_type = 'score_field'",
            $form_id
        ));

        if ($existing) {
            // Atualiza o registro existente
            $result = $wpdb->update(
                $this->table_name,
                array(
                    'field_id' => $field_id,
                    'answer_type' => 'score_field',
                    'correct_answer' => '',
                    'second_answer' => '',
                    'updated_at' => current_time('mysql')
                ),
                array(
                    'form_id' => $form_id,
                    'answer_type' => 'score_field'
                ),
                array('%d', '%s', '%s', '%s'),
                array('%d', '%s')
            );
        } else {
            // Insere novo registro
            $result = $wpdb->insert(
                $this->table_name,
                array(
                    'form_id' => $form_id,
                    'field_id' => $field_id,
                    'answer_type' => 'score_field',
                    'correct_answer' => '',
                    'second_answer' => '',
                    'created_at' => current_time('mysql'),
                    'updated_at' => current_time('mysql')
                ),
                array('%d', '%d', '%s', '%s', '%s', '%s', '%s')
            );
        }

        if ($result === false) {
            wp_send_json_error(array('message' => 'Erro ao salvar campo'));
            return;
        }

        wp_send_json_success(array(
            'message' => 'Campo salvo com sucesso',
            'field_id' => $field_id
        ));
    }

    public function add_smart_tags($tags) {
        // Add our new smart tag
        $tags['quiz_incorrect_answers'] = 'Quiz - Respostas Parcialmente Corretas';
        return $tags;
    }
}

// Instancia a classe fora
$wpforms_quiz = new WPForms_Quiz_Score();

// Registra o hook de ativação separadamente
register_activation_hook(__FILE__, array($wpforms_quiz, 'create_answers_table')); 